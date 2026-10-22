import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CentersService } from '../centers/centers.service';
import { ScheduleService } from '../schedule/schedule.service';
import { sessionState } from '../../models/schedule/meeting.model';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { UsersDirectoryService } from '../../core/services/users/users-directory.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

interface MetricCard {
  label: string;
  value: string | number;
  icon: string;
  link?: string;
}

interface QuickAction {
  label: string;
  description: string;
  icon: string;
  path: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  template: `
    <div class="page">

      <!-- Page header -->
      <header class="page-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">Welcome back, {{ auth.userProfile()?.name ?? 'Admin' }}</p>
        </div>
        <div class="header-actions">
          <a *ngIf="auth.isAdmin()" routerLink="/centers/new" class="btn btn-primary">
            <sc-icon name="plus" [size]="15" [stroke]="2.5"></sc-icon>
            New Center
          </a>
          <a *ngIf="!auth.isAdmin()" routerLink="/schedule/new" class="btn btn-primary">
            <sc-icon name="plus" [size]="15" [stroke]="2.5"></sc-icon>
            Schedule Class
          </a>
        </div>
      </header>

      <!-- Metrics -->
      <div class="metrics-grid">
        <div *ngFor="let m of metrics()" class="metric-card card">
          <div class="metric-top">
            <span class="metric-label">{{ m.label }}</span>
            <div class="metric-icon">
              <sc-icon [name]="m.icon" [size]="16"></sc-icon>
            </div>
          </div>
          <div class="metric-value">{{ m.value }}</div>
          <a *ngIf="m.link" [routerLink]="m.link" class="metric-link">
            View all
            <sc-icon name="arrow-left" [size]="13" [stroke]="2" style="transform:rotate(180deg)"></sc-icon>
          </a>
        </div>
      </div>

      <!-- Bottom grid -->
      <div class="dashboard-grid">

        <!-- Quick actions -->
        <section class="card section-card">
          <h2 class="section-heading">Quick actions</h2>
          <div class="actions-list" *ngIf="auth.isAdmin()">
            <a *ngFor="let action of adminActions" [routerLink]="action.path" class="action-item">
              <div class="action-icon">
                <sc-icon [name]="action.icon" [size]="17"></sc-icon>
              </div>
              <div class="action-text">
                <div class="action-label">{{ action.label }}</div>
                <div class="action-desc">{{ action.description }}</div>
              </div>
              <sc-icon name="chevron-right" [size]="16" [stroke]="2" class="action-arrow"></sc-icon>
            </a>
          </div>
          <div class="actions-list" *ngIf="!auth.isAdmin()">
            <a *ngFor="let action of teacherActions" [routerLink]="action.path" class="action-item">
              <div class="action-icon">
                <sc-icon [name]="action.icon" [size]="17"></sc-icon>
              </div>
              <div class="action-text">
                <div class="action-label">{{ action.label }}</div>
                <div class="action-desc">{{ action.description }}</div>
              </div>
              <sc-icon name="chevron-right" [size]="16" [stroke]="2" class="action-arrow"></sc-icon>
            </a>
          </div>
        </section>

        <!-- Platform overview -->
        <section class="card section-card">
          <h2 class="section-heading">Platform</h2>
          <div class="overview-list">
            <div class="overview-row">
              <span class="overview-label">Product</span>
              <span class="overview-value">Scholo</span>
            </div>
            <div class="overview-row">
              <span class="overview-label">Version</span>
              <span class="overview-value">Admin 1.0</span>
            </div>
            <div class="overview-row">
              <span class="overview-label">Syllabus</span>
              <span class="overview-value">NCERT + Custom</span>
            </div>
            <div class="overview-row">
              <span class="overview-label">Role</span>
              <span class="overview-value role-badge" [class.admin]="auth.isAdmin()">
                {{ auth.isAdmin() ? 'Administrator' : 'Teacher' }}
              </span>
            </div>
          </div>
        </section>

      </div>
    </div>
  `,
  styles: [`
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }

    .metric-card {
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .metric-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2px;
    }

    .metric-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      letter-spacing: 0.01em;
    }

    .metric-icon {
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--surface-secondary);
      border-radius: var(--r-md);
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .metric-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1;
      letter-spacing: -0.03em;
    }

    .metric-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--text-link);
      text-decoration: none;
      font-weight: 500;
      margin-top: 4px;
    }
    .metric-link:hover { color: var(--text-link-hv); text-decoration: underline; }

    /* Dashboard grid */
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }

    .section-card { padding: 20px 22px; }

    .section-heading {
      margin: 0 0 16px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    /* Actions */
    .actions-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .action-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 10px;
      border-radius: var(--r-md);
      text-decoration: none;
      transition: background var(--dur-fast);
      cursor: pointer;
    }

    .action-item:hover { background: var(--surface-hover); }

    .action-icon {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--brand-subtle);
      border-radius: var(--r-md);
      color: var(--brand-text);
      flex-shrink: 0;
    }

    .action-text { flex: 1; }

    .action-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .action-desc {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 1px;
    }

    .action-arrow { color: var(--text-muted); }

    /* Overview */
    .overview-list { display: flex; flex-direction: column; }

    .overview-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--border-subtle);
    }

    .overview-row:last-child { border-bottom: none; padding-bottom: 0; }

    .overview-label {
      font-size: 13px;
      color: var(--text-muted);
    }

    .overview-value {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .role-badge {
      padding: 2px 10px;
      border-radius: var(--r-full);
      font-size: 11px;
      font-weight: 600;
      background: var(--surface-secondary);
      color: var(--text-muted);
    }

    .role-badge.admin {
      background: var(--brand-subtle);
      color: var(--brand-text);
    }
  `],
})
export class DashboardComponent implements OnInit {
  auth    = inject(AdminAuthService);
  private centersService = inject(CentersService);
  private scheduleService = inject(ScheduleService);
  private directory = inject(UsersDirectoryService);

  metrics = signal<MetricCard[]>([]);

  adminActions: QuickAction[] = [
    { label: 'Add Center',          description: 'Register a new tuition center',  icon: 'buildings',  path: '/centers/new' },
    { label: 'Review Applications', description: 'Approve or reject pending apps',  icon: 'clipboard',  path: '/applications' },
    { label: 'Manage Teachers',     description: 'View and edit teacher accounts',  icon: 'person',     path: '/teachers' },
    { label: 'View Analytics',      description: 'Platform-wide usage reports',     icon: 'chart-bar',  path: '/analytics' },
  ];

  teacherActions: QuickAction[] = [
    { label: 'Schedule a Class', description: 'Add a new session to your calendar', icon: 'calendar', path: '/schedule/new' },
    { label: 'My Schedule',      description: 'View your upcoming sessions',        icon: 'clipboard', path: '/schedule' },
    { label: 'My Profile',       description: 'Update photo, bio and UPI details',  icon: 'person',    path: '/profile' },
  ];

  async ngOnInit() {
    if (this.auth.isAdmin()) {
      this.metrics.set([
        { label: 'Total Centers',   value: '—', icon: 'buildings',    link: '/centers' },
        { label: 'Total Teachers',  value: '—', icon: 'person',       link: '/teachers' },
        { label: 'Classes (Week)',  value: '—', icon: 'calendar',     link: '/schedule' },
        { label: 'Classes (Month)', value: '—', icon: 'chart-bar',    link: '/analytics' },
        { label: 'Classes (Total)', value: '—', icon: 'academic-cap', link: '/analytics' },
      ]);

      const [centersRes, teachersRes, countsRes] = await Promise.all([
        this.centersService.listCenters(),
        this.directory.listTeachers(),
        this.scheduleService.getCounts(),
      ]);

      const c = countsRes.data;
      this.metrics.update(list => list.map((m, i) => {
        if (i === 0 && centersRes.ok)  return { ...m, value: centersRes.data?.length ?? 0 };
        if (i === 1 && teachersRes.ok) return { ...m, value: teachersRes.data?.length ?? 0 };
        if (i === 2 && c)              return { ...m, value: c.week };
        if (i === 3 && c)              return { ...m, value: c.month };
        if (i === 4 && c)              return { ...m, value: c.total };
        return m;
      }));
    } else {
      this.metrics.set([
        { label: 'Upcoming Classes', value: '—', icon: 'calendar', link: '/schedule' },
        { label: 'This Week',        value: '—', icon: 'chart-bar', link: '/analytics' },
        { label: 'This Month',       value: '—', icon: 'chart-bar', link: '/analytics' },
        { label: 'All Time',         value: '—', icon: 'chart-bar', link: '/analytics' },
      ]);

      const [scheduleRes, countsRes] = await Promise.all([
        this.scheduleService.listForCurrentUser(),
        this.scheduleService.getCounts(),
      ]);

      const upcoming = (scheduleRes.data ?? []).filter(m => sessionState(m) !== 'past').length;
      const c = countsRes.data;

      this.metrics.set([
        { label: 'Upcoming Classes', value: upcoming,          icon: 'calendar',  link: '/schedule' },
        { label: 'This Week',        value: c?.week ?? '—',    icon: 'chart-bar', link: '/analytics' },
        { label: 'This Month',       value: c?.month ?? '—',   icon: 'chart-bar', link: '/analytics' },
        { label: 'All Time',         value: c?.total ?? '—',   icon: 'chart-bar', link: '/analytics' },
      ]);
    }
  }
}
