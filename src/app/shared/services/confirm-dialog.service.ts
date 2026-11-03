import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red) instead of primary (brand). */
  danger?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (result: boolean) => void;
}

/**
 * App-wide replacement for the native `confirm()` dialog.
 * Call `confirm(...)` from any component; render `<app-confirm-dialog>` once
 * (in the root shell) to display whatever request is currently pending.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly request = signal<ConfirmRequest | null>(null);

  confirm(options: ConfirmOptions | string): Promise<boolean> {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>(resolve => {
      this.request.set({ ...opts, resolve });
    });
  }

  respond(result: boolean) {
    this.request()?.resolve(result);
    this.request.set(null);
  }
}
