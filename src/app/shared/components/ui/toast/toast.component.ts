import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="toast.toast() as t" class="toast" [class.toast-error]="t.type === 'error'" role="status">
      {{ t.msg }}
    </div>
  `,
  styles: [`
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      padding: 12px 20px;
      background: var(--live-bg, #f6ffed);
      color: var(--live-text, #389e0d);
      border: 1px solid var(--live-dot, #52c41a);
      border-radius: var(--r-sm);
      font-size: 13px;
      font-weight: 600;
      box-shadow: var(--shadow-md);
    }
    .toast.toast-error {
      background: var(--danger-subtle, #fff1f0);
      color: var(--danger, #cf1322);
      border-color: var(--danger-border, #ffa39e);
    }
  `],
})
export class ToastComponent {
  toast = inject(ToastService);
}
