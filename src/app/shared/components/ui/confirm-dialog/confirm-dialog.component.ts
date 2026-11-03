import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmDialogService } from '../../../services/confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="dialog.request() as req" class="modal-backdrop" (click)="dialog.respond(false)">
      <div class="modal confirm-modal" (click)="$event.stopPropagation()" role="alertdialog" aria-modal="true">
        <div class="modal-header">
          <h3>{{ req.title ?? 'Please confirm' }}</h3>
        </div>
        <div class="modal-body">
          <p class="confirm-message">{{ req.message }}</p>
        </div>
        <div class="confirm-actions">
          <button class="btn btn-secondary btn-sm" (click)="dialog.respond(false)">{{ req.cancelLabel ?? 'Cancel' }}</button>
          <button
            class="btn btn-sm"
            [class.btn-danger]="req.danger"
            [class.btn-primary]="!req.danger"
            (click)="dialog.respond(true)"
          >{{ req.confirmLabel ?? 'Confirm' }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .confirm-modal { width: 400px; }
    .confirm-message { margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.5; white-space: pre-line; }
    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px 22px;
      border-top: 1px solid var(--border-default);
    }
  `],
})
export class ConfirmDialogComponent {
  dialog = inject(ConfirmDialogService);
}
