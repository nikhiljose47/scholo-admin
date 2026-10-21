import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  theme = signal<'light' | 'dark'>(ThemeService.readSaved());
  isDark = computed(() => this.theme() === 'dark');

  constructor() {
    this.applyTheme(this.theme());
  }

  toggle(): void {
    const next: 'light' | 'dark' = this.isDark() ? 'light' : 'dark';
    this.theme.set(next);
    this.applyTheme(next);
    try { localStorage.setItem('scholo-theme', next); } catch { /* noop */ }
  }

  private applyTheme(t: 'light' | 'dark'): void {
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }

  private static readSaved(): 'light' | 'dark' {
    try {
      const saved = localStorage.getItem('scholo-theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch { /* noop */ }
    return 'light';
  }
}
