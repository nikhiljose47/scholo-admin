import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error';

export interface ToastMessage {
  id: number;
  msg: string;
  type: ToastType;
}

/**
 * App-wide replacement for ad-hoc per-component toast signals.
 * Call `show(...)` from any component; render `<app-toast>` once
 * (in the root shell) to display whatever is currently active.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toast = signal<ToastMessage | null>(null);
  private nextId = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(msg: string, type: ToastType = 'success', durationMs = 4000) {
    clearTimeout(this.timer);
    const id = ++this.nextId;
    this.toast.set({ id, msg, type });
    this.timer = setTimeout(() => {
      if (this.toast()?.id === id) this.toast.set(null);
    }, durationMs);
  }

  success(msg: string, durationMs?: number) {
    this.show(msg, 'success', durationMs);
  }

  error(msg: string, durationMs?: number) {
    this.show(msg, 'error', durationMs);
  }

  dismiss() {
    clearTimeout(this.timer);
    this.toast.set(null);
  }
}
