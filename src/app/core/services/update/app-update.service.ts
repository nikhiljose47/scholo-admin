import { Injectable, inject, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';

const CHECK_EVERY_MS = 2 * 60 * 1000;
const MAIN_BUNDLE = /<script[^>]+src="(main-[A-Za-z0-9_-]+\.js)"/;

/** Detects a new deployment by comparing the bundle name in the live index.html with the one this
 *  tab loaded, then reloads automatically. Never reloads mid-form: on create/edit screens it waits
 *  for the next navigation (and shows a banner with a manual "Reload now"). */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private router = inject(Router);
  private started = false;
  private checking = false;
  private currentBundle: string | null = null;

  /** True when a new version is waiting and we're holding off reloading (form screens). */
  readonly waiting = signal(false);
  private updateReady = false;

  start(): void {
    if (this.started || typeof document === 'undefined') return;
    this.started = true;

    const src = document.querySelector<HTMLScriptElement>('script[src*="main-"]')?.getAttribute('src');
    this.currentBundle = src?.match(/(main-[A-Za-z0-9_-]+\.js)/)?.[1] ?? null;
    if (!this.currentBundle) return; // dev server / unhashed build: nothing to compare

    setInterval(() => { if (document.visibilityState === 'visible') void this.check(); }, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.check(); });
    window.addEventListener('online', () => void this.check());

    // Safe moment to swap versions: the user is already leaving the current screen.
    this.router.events.subscribe(e => {
      if (e instanceof NavigationStart && this.updateReady) window.location.assign(e.url);
    });
  }

  reloadNow(): void {
    window.location.reload();
  }

  private async check(): Promise<void> {
    if (this.checking || this.updateReady) return;
    this.checking = true;
    try {
      const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const latest = (await res.text()).match(MAIN_BUNDLE)?.[1];
      if (!latest || latest === this.currentBundle) return;

      this.updateReady = true;
      if (this.onFormScreen()) this.waiting.set(true);
      else window.location.reload();
    } catch {
      // offline or transient: try again at the next interval
    } finally {
      this.checking = false;
    }
  }

  private onFormScreen(): boolean {
    const p = window.location.pathname;
    return /\/new$/.test(p) || p.includes('/edit');
  }
}
