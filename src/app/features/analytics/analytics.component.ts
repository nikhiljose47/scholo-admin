import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScheduleService, ScheduleCounts } from '../schedule/schedule.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';

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

  async ngOnInit() {
    const res = await this.schedule.getCounts();
    if (!res.ok || !res.data) return this.failed.set(true);
    const c: ScheduleCounts = res.data;
    this.stats.update(list => list.map((s, i) => ({ ...s, value: [c.week, c.month, c.total][i] })));
  }
}
