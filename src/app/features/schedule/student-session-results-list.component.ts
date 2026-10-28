import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StudentSessionResult } from '../../models/schedule/session-result.model';

@Component({
  selector: 'app-student-session-results-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="results-wrap">

      <div class="results-header">
        <div class="stats-row">
          <div class="stat-box">
            <div class="stat-val">{{ data().length }}</div>
            <div class="stat-lbl">Students</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">{{ avgMarks() }}</div>
            <div class="stat-lbl">Avg Marks</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">{{ avgEngagement() }}</div>
            <div class="stat-lbl">Avg Engagement</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" (click)="refetch.emit()">Fetch again</button>
      </div>

      <div class="table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th>Student</th>
              <th class="num-col">Assignment</th>
              <th class="num-col">Max</th>
              <th class="num-col">Engagement</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of data(); trackBy: trackRow">
              <td class="mono">{{ r.studentId || r.studentUid || '—' }}</td>
              <td class="num-col">{{ r.assignmentMarks }}</td>
              <td class="num-col">{{ r.maxMarks }}</td>
              <td class="num-col">{{ r.engagementScore }}</td>
              <td class="muted">{{ r.remarks || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  `,
  styles: [`
    .results-wrap { display: flex; flex-direction: column; gap: 12px; }

    .results-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .stats-row { display: flex; gap: 16px; }

    .stat-box { text-align: center; }

    .stat-val {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1;
    }

    .stat-lbl {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 3px;
      white-space: nowrap;
    }

    .table-wrap { overflow-x: auto; }

    .results-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .results-table th {
      text-align: left;
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border-subtle);
      white-space: nowrap;
    }

    .results-table td {
      padding: 9px 12px;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-subtle);
    }

    .results-table tr:last-child td { border-bottom: none; }

    .num-col { text-align: right; }

    .mono { font-family: var(--font-mono); font-size: 12px; color: var(--text-primary); }

    .muted { color: var(--text-muted); font-size: 12px; }
  `],
})
export class StudentSessionResultsListComponent {
  readonly data = input<StudentSessionResult[]>([]);
  readonly refetch = output<void>();

  readonly avgMarks = computed(() => {
    const d = this.data();
    if (!d.length) return '0.0';
    return (d.reduce((s, r) => s + r.assignmentMarks, 0) / d.length).toFixed(1);
  });

  readonly avgEngagement = computed(() => {
    const d = this.data();
    if (!d.length) return '0.0';
    return (d.reduce((s, r) => s + r.engagementScore, 0) / d.length).toFixed(1);
  });

  trackRow(_: number, r: StudentSessionResult) {
    return r.studentId ?? r.studentUid;
  }
}
