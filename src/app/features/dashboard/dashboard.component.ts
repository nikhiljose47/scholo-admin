import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CentersService } from '../centers/centers.service';
import { ScheduleService } from '../schedule/schedule.service';
import { sessionState } from '../../models/schedule/meeting.model';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { UsersDirectoryService } from '../../core/services/users/users-directory.service';

interface StatCard {
  label: string;
  value: string | number;
  icon: string;
  color: string;
  link?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dashboard">
      <header class="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back, {{ auth.userProfile()?.name ?? 'Admin' }}</p>
        </div>
        <div class="header-actions">
          <a *ngIf="auth.isAdmin()" routerLink="/centers/new" class="btn-primary">+ New Center</a>
          <a *ngIf="!auth.isAdmin()" routerLink="/schedule/new" class="btn-primary">+ Schedule Class</a>
        </div>
      </header>

      <div class="stats-grid">
        <div *ngFor="let stat of stats()" class="stat-card" [style.border-left-color]="stat.color">
          <div class="stat-icon">{{ stat.icon }}</div>
          <div class="stat-body">
            <div class="stat-value">{{ stat.value }}</div>
            <div class="stat-label">{{ stat.label }}</div>
          </div>
          <a *ngIf="stat.link" [routerLink]="stat.link" class="stat-link">View →</a>
        </div>
      </div>

      <div class="dashboard-grid">
        <section class="card">
          <h2>Quick Actions</h2>
          <div class="quick-actions" *ngIf="auth.isAdmin()">
            <a routerLink="/centers/new" class="action-btn">➕ Add Center</a>
            <a routerLink="/applications" class="action-btn">📋 Review Applications</a>
            <a routerLink="/teachers" class="action-btn">👨‍🏫 Manage Teachers</a>
            <a routerLink="/analytics" class="action-btn">📈 View Reports</a>
          </div>
          <div class="quick-actions" *ngIf="!auth.isAdmin()">
            <a routerLink="/schedule/new" class="action-btn">📅 Schedule a Class</a>
            <a routerLink="/schedule" class="action-btn">📋 View My Schedule</a>
          </div>
        </section>

        <section class="card">
          <h2>Platform Overview</h2>
          <div class="overview-list">
            <div class="overview-item">
              <span class="overview-label">Platform</span>
              <span class="overview-value">Scholo</span>
            </div>
            <div class="overview-item">
              <span class="overview-label">Version</span>
              <span class="overview-value">Admin v1.0</span>
            </div>
            <div class="overview-item">
              <span class="overview-label">Syllabus</span>
              <span class="overview-value">NCERT + Custom</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .dashboard { max-width: 1200px; margin: 0 auto; }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
    }

    h1 { margin: 0; font-size: 24px; font-weight: 700; color: #1e293b; }
    p { margin: 4px 0 0; color: #64748b; font-size: 14px; }

    .btn-primary {
      padding: 10px 18px;
      background: #3b82f6;
      color: #fff;
      border-radius: 8px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: #fff;
      border-radius: 12px;
      padding: 20px;
      border-left: 4px solid;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }

    .stat-icon { font-size: 28px; }
    .stat-value { font-size: 22px; font-weight: 700; color: #1e293b; }
    .stat-label { font-size: 12px; color: #64748b; }
    .stat-link { margin-left: auto; color: #3b82f6; text-decoration: none; font-size: 13px; }

    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
    }

    .card {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }

    h2 { margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #1e293b; }

    .quick-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .action-btn {
      padding: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      text-decoration: none;
      color: #374151;
      font-size: 13px;
      text-align: center;
      transition: background 0.15s;
    }

    .action-btn:hover { background: #f1f5f9; }

    .overview-list { display: flex; flex-direction: column; gap: 12px; }
    .overview-item { display: flex; justify-content: space-between; }
    .overview-label { color: #64748b; font-size: 14px; }
    .overview-value { font-weight: 600; font-size: 14px; color: #1e293b; }
  `],
})
export class DashboardComponent implements OnInit {
  auth = inject(AdminAuthService);
  private centersService = inject(CentersService);
  private scheduleService = inject(ScheduleService);
  private directory = inject(UsersDirectoryService);

  stats = signal<StatCard[]>([]);

  async ngOnInit() {
    if (this.auth.isAdmin()) {
      this.stats.set([
        { label: 'Total Centers', value: '—', icon: '🏫', color: '#3b82f6', link: '/centers' },
        { label: 'Pending Applications', value: '—', icon: '📋', color: '#f59e0b', link: '/applications' },
        { label: 'Total Teachers', value: '—', icon: '👨‍🏫', color: '#8b5cf6', link: '/teachers' },
      ]);

      // Admin: platform-wide counts — each is cached, so repeat dashboard visits are free reads.
      const [centersRes, teachersRes] = await Promise.all([
        this.centersService.listCenters(),
        this.directory.listTeachers(),
      ]);
      this.stats.update(s => s.map((card, i) => {
        if (i === 0 && centersRes.ok) return { ...card, value: centersRes.data?.length ?? 0 };
        if (i === 2 && teachersRes.ok) return { ...card, value: teachersRes.data?.length ?? 0 };
        return card;
      }));
    } else {
      // Teacher: only ever their own data — never a platform-wide count.
      this.stats.set([
        { label: 'My Upcoming Classes', value: '—', icon: '📅', color: '#3b82f6', link: '/schedule' },
        { label: 'My Centers', value: '—', icon: '🏫', color: '#10b981' },
      ]);

      const [scheduleRes, centersRes] = await Promise.all([
        this.scheduleService.listForCurrentUser(),
        this.centersService.listMyCenters(),
      ]);

      const upcoming = (scheduleRes.data ?? []).filter(m => sessionState(m) !== 'past').length;
      const myCenters = centersRes.data?.length ?? 0;

      this.stats.set([
        { label: 'My Upcoming Classes', value: upcoming, icon: '📅', color: '#3b82f6', link: '/schedule' },
        { label: 'My Centers', value: myCenters, icon: '🏫', color: '#10b981' },
      ]);
    }
  }
}
