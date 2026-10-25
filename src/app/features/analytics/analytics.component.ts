import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScheduleService, ScheduleCounts, toISTDateStr } from '../schedule/schedule.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { Meeting, sessionState } from '../../models/schedule/meeting.model';

/** IST offset for computing week boundaries */
const IST_OFFSET_MS = 330 * 60 * 1000;

/** Returns the ISO date string of the Monday that starts the week containing `ms` (in IST). */
function weekStartKey(ms: number): string {
  const istMs = ms + IST_OFFSET_MS;
  const dayOfWeek = new Date(istMs).getUTCDay(); // 0=Sun
  const sinceMonday = (dayOfWeek + 6) % 7;
  return new Date(istMs - sinceMonday * 86400000).toISOString().slice(0, 10);
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Analytics</h1>
        <p>{{ auth.isAdmin() ? 'Classes scheduled across the platform' : 'Classes you have scheduled' }}</p>
      </header>

      <p class="state error" *ngIf="failed()">Couldn't load the counts. Reload to try again.</p>

      <div class="stats" *ngIf="!failed()">
        <div class="stat" *ngFor="let s of stats()">
          <span class="stat-label">{{ s.label }}</span>
          <span class="stat-value">{{ s.value }}</span>
          <span class="stat-hint">{{ s.hint }}</span>
        </div>
      </div>

      <!-- Teaching Consistency (teachers only) -->
      <section class="section" *ngIf="!auth.isAdmin() && !failed()">
        <h2 class="section-title">Teaching Consistency</h2>
        <div class="streak-row">
          <div class="streak-num" [class.zero]="streak() === 0">{{ streak() }}</div>
          <div class="streak-info">
            <span class="streak-title">{{ streak() === 1 ? 'week' : 'weeks' }} in a row</span>
            <span class="streak-hint">Consecutive weeks with at least one class (past 90 days)</span>
          </div>
        </div>
      </section>

      <!-- Classes Conducted history (teachers only) -->
      <section class="section" *ngIf="!auth.isAdmin() && pastMeetings().length">
        <h2 class="section-title">Classes Conducted</h2>
        <table class="hist-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Class</th>
              <th>Chapter</th>
              <th>Min</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let m of pastMeetings().slice(0, 20)">
              <td>{{ dateStr(m) }}</td>
              <td>{{ m.className || m.classId }}</td>
              <td>{{ m.chapterName || m.chapterCode }}</td>
              <td class="min">{{ m.duration }}</td>
            </tr>
          </tbody>
        </table>
        <p class="table-hint" *ngIf="pastMeetings().length > 20">Showing last 20 of {{ pastMeetings().length }} sessions</p>
      </section>

      <p class="empty-hint" *ngIf="!auth.isAdmin() && !pastMeetings().length && !failed()">
        No past classes recorded in the last 90 days.
      </p>
    </div>
  `,
  styles: [`
    .page { max-width: 900px; margin: 0 auto; }
    .page-header { margin-bottom: 24px; }
    h1 { margin: 0; font-size: 22px; font-weight: 700; color: var(--text-primary); }
    .page-header p { margin: 4px 0 0; color: var(--text-muted); font-size: 14px; }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .stat {
      display: flex; flex-direction: column; gap: 6px; padding: 20px;
      background: var(--surface-primary); border: 1px solid var(--border-default); border-radius: 14px;
    }
    .stat-label { font-size: 13px; font-weight: 600; color: var(--text-muted); }
    .stat-value { font-size: 36px; font-weight: 700; line-height: 1.1; color: var(--text-primary); }
    .stat-hint { font-size: 12px; color: var(--text-placeholder); }
    .state.error { color: var(--border-error); font-size: 14px; }

    .section { margin-top: 32px; }
    .section-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0 0 14px; }

    .streak-row {
      display: flex; align-items: center; gap: 16px; padding: 18px 20px;
      background: var(--surface-primary); border: 1px solid var(--border-default); border-radius: 14px;
    }
    .streak-num { font-size: 40px; font-weight: 800; color: var(--brand); line-height: 1; min-width: 56px; text-align: center; }
    .streak-num.zero { color: var(--text-muted); }
    .streak-info { display: flex; flex-direction: column; gap: 2px; }
    .streak-title { font-size: 16px; font-weight: 600; color: var(--text-primary); }
    .streak-hint { font-size: 12px; color: var(--text-muted); }

    .hist-table {
      width: 100%; border-collapse: collapse;
      background: var(--surface-primary); border: 1px solid var(--border-default); border-radius: 12px; overflow: hidden;
      font-size: 13px;
    }
    .hist-table th {
      padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted);
      border-bottom: 1px solid var(--border-default);
    }
    .hist-table td { padding: 9px 14px; border-bottom: 1px solid var(--border-default); color: var(--text-primary); }
    .hist-table tr:last-child td { border-bottom: none; }
    .hist-table .min { color: var(--text-muted); }
    .table-hint { font-size: 12px; color: var(--text-muted); margin: 8px 0 0; }
    .empty-hint { color: var(--text-muted); font-size: 14px; margin-top: 24px; }
  `],
})
export class AnalyticsComponent implements OnInit {
  protected auth = inject(AdminAuthService);
  private schedule = inject(ScheduleService);

  stats = signal<{ label: string; value: string | number; hint: string }[]>([
    { label: 'This week', value: '—', hint: 'Mon–Sun' },
    { label: 'This month', value: '—', hint: 'Calendar month' },
    { label: 'All time', value: '—', hint: 'Every class scheduled' },
  ]);
  failed = signal(false);
  pastMeetings = signal<Meeting[]>([]);

  streak = computed(() => {
    const past = this.pastMeetings();
    if (!past.length) return 0;
    const weeksWithClass = new Set(past.map(m => weekStartKey(m.date.toMillis())));
    let count = 0;
    let cursor = Date.now();
    while (weeksWithClass.has(weekStartKey(cursor))) {
      count++;
      cursor -= 7 * 24 * 60 * 60 * 1000;
    }
    return count;
  });

  async ngOnInit() {
    const isAdmin = this.auth.isAdmin();
    const [countsRes, meetingsRes] = await Promise.all([
      this.schedule.getCounts(),
      isAdmin
        ? Promise.resolve({ ok: true as const, data: [] as Meeting[] })
        : this.schedule.listForCurrentUser(90, 200),
    ]);

    if (!countsRes.ok || !countsRes.data) return void this.failed.set(true);
    const c: ScheduleCounts = countsRes.data;
    this.stats.update(list => list.map((s, i) => ({ ...s, value: [c.week, c.month, c.total][i] })));

    if (!isAdmin && meetingsRes.ok && meetingsRes.data) {
      this.pastMeetings.set(meetingsRes.data.filter(m => sessionState(m) === 'past'));
    }
  }

  dateStr(m: Meeting): string {
    return toISTDateStr(m.date);
  }
}
