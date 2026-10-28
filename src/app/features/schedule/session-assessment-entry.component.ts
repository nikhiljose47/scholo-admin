import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SessionImportRow } from '../../models/schedule/session-result.model';
import { RosterEntry } from '../../models/schedule/session-result.model';

interface RowError {
  row: number;
  message: string;
}

@Component({
  selector: 'app-session-assessment-entry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="close()">
      <div class="modal sae-modal" (click)="$event.stopPropagation()">

        <div class="modal-header">
          <h3 class="modal-title">Bulk Session Import</h3>
          <button class="btn btn-ghost btn-sm icon-only" (click)="close()">✕</button>
        </div>

        <div class="modal-body">
          <p class="hint">
            Paste rows copied from Excel or Google Sheets. First row (header) is skipped.<br>
            Columns: <code>studentId · assignmentMarks · maxMarks · participationRating (opt) · remarks (opt)</code>
          </p>

          <textarea
            class="import-area"
            [(ngModel)]="rawText"
            [placeholder]="placeholder"
            rows="10"
            spellcheck="false"
          ></textarea>

          <div *ngIf="errors().length" class="error-list">
            <p class="error-title">{{ errors().length }} error(s) found — fix before importing:</p>
            <ul>
              <li *ngFor="let e of errors()">Row {{ e.row }} — {{ e.message }}</li>
            </ul>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" (click)="close()">Cancel</button>
          <button class="btn btn-primary" (click)="tryImport()">Parse &amp; Import</button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .sae-modal { width: min(640px, 95vw); max-height: 90vh; display: flex; flex-direction: column; }

    .modal-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }

    .hint {
      font-size: 12px;
      color: var(--text-muted);
      margin: 0;
      line-height: 1.6;
    }

    .import-area {
      width: 100%;
      font-family: var(--font-mono);
      font-size: 12px;
      background: var(--surface-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--r-sm);
      padding: 10px 12px;
      color: var(--text-primary);
      resize: vertical;
      outline: none;
      box-sizing: border-box;
    }

    .import-area:focus { border-color: var(--border-focus); box-shadow: 0 0 0 3px var(--border-focus-ring); }

    .error-list {
      background: var(--danger-subtle, #fff1f0);
      border: 1px solid var(--danger-border, #ffa39e);
      border-radius: var(--r-sm);
      padding: 12px 16px;
      font-size: 12px;
      color: var(--danger, #cf1322);
    }

    .error-title { margin: 0 0 8px; font-weight: 600; }

    .error-list ul {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .modal-footer { display: flex; justify-content: flex-end; gap: 8px; }
    .icon-only { padding: 0; width: 30px; height: 30px; }
  `],
})
export class SessionAssessmentEntryComponent {
  readonly roster = input<RosterEntry[]>([]);

  readonly closeEvent = output<void>();
  readonly importEvent = output<SessionImportRow[]>();

  rawText = '';
  errors = signal<RowError[]>([]);

  readonly placeholder = [
    'studentId\tassignmentMarks\tmaxMarks\tparticipationRating\tremarks',
    'uid_abc123\t18\t20\t4\tGood understanding',
    'uid_def456\t14\t20\t3\t',
    'uid_ghi789\t20\t20\t5\tExcellent',
  ].join('\n');

  close() { this.closeEvent.emit(); }

  tryImport() {
    const { rows, errors } = this.parse(this.rawText);
    this.errors.set(errors);
    if (errors.length) return;
    this.importEvent.emit(rows);
    this.closeEvent.emit();
  }

  private parse(text: string): { rows: SessionImportRow[]; errors: RowError[] } {
    const lines = text.split('\n');
    const rows: SessionImportRow[] = [];
    const errors: RowError[] = [];
    const rosterUids = new Set(this.roster().map(r => r.uid));

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const rowNum = i + 1; // 1-based counting including header

      if (!line.trim()) continue;

      const cols = line.split('\t');

      if (cols.length < 3) {
        errors.push({ row: rowNum, message: 'Incomplete row data' });
        continue;
      }

      if (cols.length > 5) {
        errors.push({ row: rowNum, message: 'Extra column detected' });
        continue;
      }

      const [rawId, rawAssign, rawMax, rawRating, rawRemarks] = cols.map(c => c.trim());

      if (!rawId) {
        errors.push({ row: rowNum, message: 'studentId is required' });
        continue;
      }

      // Roster resolution: studentId must match an enrolled student UID
      if (rosterUids.size && !rosterUids.has(rawId)) {
        errors.push({ row: rowNum, message: `studentId '${rawId}' not found in class roster` });
        continue;
      }

      const assignmentMarks = parseInt(rawAssign, 10);
      const maxMarks = parseInt(rawMax, 10);

      if (!Number.isInteger(assignmentMarks) || isNaN(assignmentMarks)) {
        errors.push({ row: rowNum, message: 'assignmentMarks must be an integer' });
        continue;
      }

      if (!Number.isInteger(maxMarks) || isNaN(maxMarks)) {
        errors.push({ row: rowNum, message: 'maxMarks must be an integer' });
        continue;
      }

      if (assignmentMarks > maxMarks) {
        errors.push({ row: rowNum, message: 'assignmentMarks must not exceed maxMarks' });
        continue;
      }

      let engagementScore = 0;
      if (rawRating !== undefined && rawRating !== '') {
        const rating = parseInt(rawRating, 10);
        if (!Number.isInteger(rating) || isNaN(rating)) {
          errors.push({ row: rowNum, message: 'participationRating must be an integer' });
          continue;
        }
        engagementScore = rating;
      }

      rows.push({
        studentId: rawId,
        assignmentMarks,
        maxMarks,
        engagementScore,
        remarks: rawRemarks ?? '',
      });
    }

    return { rows, errors };
  }
}
