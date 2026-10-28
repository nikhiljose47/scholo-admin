import { Component, input, output, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Meeting } from '../../models/schedule/meeting.model';
import { RosterEntry } from '../../models/schedule/session-result.model';
import { toISTTimeStr } from './schedule.service';

interface AttendanceEntry {
  uid: string;
  name: string;
  present: boolean;
}

@Component({
  selector: 'app-class-wrapup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="wrapup-wrap">

      <!-- Header -->
      <div class="wrapup-header">
        <div class="wrapup-meta">
          <span class="wrapup-ids">{{ meeting().classId }} · {{ meeting().subjectId }}</span>
          <span class="wrapup-time">{{ timeRange() }}</span>
        </div>
        <span *ngIf="isCompleted()" class="badge badge-ended">Class Ended</span>
      </div>

      <!-- Attendance -->
      <div class="section">
        <div class="section-header">
          <h4 class="section-title">Attendance</h4>
          <button
            *ngIf="!isCompleted()"
            class="btn btn-ghost btn-sm"
            (click)="markAllPresent()"
          >Mark all present</button>
        </div>

        <div *ngIf="rosterLoading()" class="loading-inline">Loading roster…</div>

        <div *ngIf="!rosterLoading() && !attendance().length" class="att-empty">
          <span *ngIf="!meeting().centerId">Meeting has no centerId — cannot load roster.</span>
          <span *ngIf="meeting().centerId">No students enrolled in this batch.</span>
        </div>

        <div *ngIf="!rosterLoading() && attendance().length" class="att-list">
          <div
            *ngFor="let s of attendance(); trackBy: trackStudent"
            class="att-row"
            [class.is-present]="s.present"
            (click)="!isCompleted() && togglePresent(s)"
            [style.cursor]="isCompleted() ? 'default' : 'pointer'"
          >
            <span class="att-name">{{ s.name }}</span>
            <span class="att-uid">{{ s.uid }}</span>
            <span class="att-badge" [class.present]="s.present">
              {{ s.present ? 'Present' : 'Absent' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Feedback (private notes) -->
      <div class="section">
        <h4 class="section-title">Feedback</h4>
        <textarea
          class="feedback-area"
          [(ngModel)]="feedback"
          placeholder="How was today's class? Any notes for yourself…"
          rows="4"
          [disabled]="isCompleted()"
        ></textarea>
      </div>

      <!-- Footer -->
      <div class="wrapup-footer">
        <button
          class="btn btn-primary"
          [disabled]="isCompleted() || saving()"
          (click)="onSubmit()"
        >
          <span *ngIf="saving()">Saving…</span>
          <span *ngIf="!saving() && !isCompleted()">Submit Class</span>
          <span *ngIf="!saving() && isCompleted()">Submitted</span>
        </button>
      </div>

    </div>
  `,
  styles: [`
    .wrapup-wrap { display: flex; flex-direction: column; gap: 20px; }

    .wrapup-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .wrapup-meta { display: flex; flex-direction: column; gap: 4px; }

    .wrapup-ids { font-size: 15px; font-weight: 600; color: var(--text-primary); }
    .wrapup-time { font-size: 12px; color: var(--text-muted); }

    .badge-ended {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: var(--r-full);
      font-size: 12px;
      font-weight: 600;
      background: var(--past-bg, #f5f5f5);
      color: var(--past-text, #595959);
      border: 1px solid var(--past-dot, #bfbfbf);
      white-space: nowrap;
    }

    .section { display: flex; flex-direction: column; gap: 10px; }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      margin: 0;
    }

    .loading-inline { font-size: 13px; color: var(--text-muted); }
    .att-empty { font-size: 13px; color: var(--text-muted); }

    .att-list { display: flex; flex-direction: column; gap: 4px; }

    .att-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: var(--r-sm);
      background: var(--surface-secondary);
      border: 1px solid transparent;
      transition: background var(--dur-base), border-color var(--dur-base);
      user-select: none;
    }

    .att-row.is-present {
      background: var(--live-bg, #f6ffed);
      border-color: var(--live-dot, #52c41a);
    }

    .att-name { flex: 1; font-size: 13px; color: var(--text-primary); font-weight: 500; }

    .att-uid {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-placeholder);
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .att-badge {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      padding: 2px 8px;
      border-radius: var(--r-full);
      background: var(--surface-primary);
      border: 1px solid var(--border-default);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .att-badge.present {
      color: var(--live-text, #389e0d);
      background: var(--live-bg, #f6ffed);
      border-color: var(--live-dot, #52c41a);
    }

    .feedback-area {
      width: 100%;
      background: var(--surface-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--r-sm);
      padding: 10px 12px;
      color: var(--text-primary);
      font-size: 13px;
      resize: vertical;
      outline: none;
      box-sizing: border-box;
      line-height: 1.5;
      font-family: inherit;
    }

    .feedback-area:focus { border-color: var(--border-focus); box-shadow: 0 0 0 3px var(--border-focus-ring); }
    .feedback-area:disabled { opacity: 0.6; cursor: not-allowed; }

    .wrapup-footer { display: flex; justify-content: flex-end; }

    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  `],
})
export class ClassWrapupComponent {
  readonly meeting = input.required<Meeting>();
  readonly roster = input<RosterEntry[]>([]);
  readonly rosterLoading = input(false);
  readonly saving = input(false);

  readonly submit = output<{ attendance: string[]; feedback: string }>();

  attendance = signal<AttendanceEntry[]>([]);
  feedback = '';

  readonly isCompleted = computed(() => this.meeting().status === 'completed');

  readonly timeRange = computed(() => {
    const m = this.meeting();
    return `${toISTTimeStr(m.date)} – ${toISTTimeStr(m.endAt)}`;
  });

  private readonly meetingId = computed(() => this.meeting().id);

  constructor() {
    // Full rebuild when the selected meeting changes.
    // Reads roster via untracked so roster-only changes don't trigger this.
    effect(() => {
      const _mid = this.meetingId();
      untracked(() => {
        const m = this.meeting();
        const preChecked = new Set<string>(m.attendance ?? []);
        const roster = this.roster();
        this.attendance.set(this.buildAttendance(preChecked, roster));
        this.feedback = (m as Meeting & { feedback?: string }).feedback ?? '';
      });
    }, { allowSignalWrites: true });

    // When the roster loads after the meeting was already selected, update
    // display names without resetting the user's present/absent choices.
    effect(() => {
      const roster = this.roster();
      if (!roster.length) return;
      untracked(() => {
        const nameMap = new Map(roster.map(r => [r.uid, r.name]));
        const current = this.attendance();
        const updated = current.map(e => ({ ...e, name: nameMap.get(e.uid) ?? e.name }));
        // Only add roster entries that aren't already in the list
        const existingUids = new Set(current.map(e => e.uid));
        const preChecked = new Set<string>(this.meeting().attendance ?? []);
        const newEntries = roster
          .filter(r => !existingUids.has(r.uid))
          .map(r => ({ uid: r.uid, name: r.name, present: preChecked.has(r.uid) }));
        this.attendance.set([...updated, ...newEntries]);
      });
    }, { allowSignalWrites: true });
  }

  private buildAttendance(preChecked: Set<string>, roster: RosterEntry[]): AttendanceEntry[] {
    if (!roster.length) {
      // Show pre-ticked UIDs from meeting.attendance even without roster names
      return [...preChecked].map(uid => ({ uid, name: uid, present: true }));
    }
    const byUid = new Map<string, AttendanceEntry>(
      roster.map(r => [r.uid, { uid: r.uid, name: r.name, present: preChecked.has(r.uid) }]),
    );
    // Include any pre-checked UIDs not in the roster
    for (const uid of preChecked) {
      if (!byUid.has(uid)) byUid.set(uid, { uid, name: uid, present: true });
    }
    return [...byUid.values()];
  }

  trackStudent(_: number, s: AttendanceEntry) { return s.uid; }

  togglePresent(s: AttendanceEntry) {
    this.attendance.update(list =>
      list.map(e => e.uid === s.uid ? { ...e, present: !e.present } : e),
    );
  }

  markAllPresent() {
    this.attendance.update(list => list.map(s => ({ ...s, present: true })));
  }

  onSubmit() {
    const present = this.attendance().filter(s => s.present).map(s => s.uid);
    this.submit.emit({ attendance: present, feedback: this.feedback });
  }
}
