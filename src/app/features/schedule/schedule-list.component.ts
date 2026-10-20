import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ScheduleService } from './schedule.service';
import { Meeting, sessionState, SessionState } from '../../models/schedule/meeting.model';
import { toISTDateStr, toISTTimeStr } from './schedule.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';

@Component({
  selector: 'app-schedule-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Class Schedule</h1>
          <p>{{ auth.isAdmin() ? 'All sessions across every center and batch' : 'Your scheduled sessions' }}</p>
        </div>
        <div class="header-actions">
          <button (click)="viewMode.set('list')" [class.active]="viewMode() === 'list'" class="view-btn">≡ List</button>
          <button (click)="viewMode.set('calendar')" [class.active]="viewMode() === 'calendar'" class="view-btn">📅 Week</button>
          <a routerLink="/schedule/new" class="btn-primary">+ Schedule Class</a>
        </div>
      </header>

      <!-- Filters -->
      <div class="filters">
        <select [(ngModel)]="filterState" class="filter-select">
          <option value="">All sessions</option>
          <option value="live">🔴 Live now</option>
          <option value="upcoming">🟡 Upcoming</option>
          <option value="past">⚫ Past</option>
        </select>
        <input type="search" [(ngModel)]="filterText" placeholder="Search class, subject, teacher…" class="search-input" />
      </div>

      <!-- Stats row -->
      <div class="stats-row">
        <div class="stat-chip live">🔴 {{ countByState('live') }} Live</div>
        <div class="stat-chip upcoming">🟡 {{ countByState('upcoming') }} Upcoming</div>
        <div class="stat-chip past">⚫ {{ countByState('past') }} Past</div>
      </div>

      <div *ngIf="loading()" class="loading">Loading sessions…</div>

      <!-- LIST VIEW -->
      <div *ngIf="!loading() && viewMode() === 'list'" class="meeting-list">
        <div *ngIf="filtered().length === 0" class="empty">
          <span>📅</span>
          <p>No sessions match the current filter.</p>
          <a routerLink="/schedule/new" class="btn-primary">Schedule a class</a>
        </div>

        <div *ngFor="let m of filtered()" class="meeting-card" [class]="stateOf(m)">
          <div class="card-left">
            <div class="state-dot" [class]="stateOf(m)"></div>
            <div class="date-block">
              <div class="date">{{ istDate(m.date) }}</div>
              <div class="time">{{ istTime(m.date) }} — {{ istTime(m.endAt) }} IST</div>
            </div>
          </div>

          <div class="card-body">
            <div class="class-name">{{ m.className || m.classId }}</div>
            <div class="subject">{{ m.subjectName || m.subjectId }} · {{ m.chapterName || m.chapterCode }}</div>
            <div class="meta-row">
              <span class="teacher">👤 {{ m.teacherName }}</span>
              <span *ngIf="m.centerId" class="center-tag">🏫 {{ m.centerId }}</span>
              <span class="batch-tag" *ngIf="m.batchId !== 'default'">📚 {{ m.batchId }}</span>
              <span class="duration">⏱ {{ m.duration }} min</span>
            </div>
          </div>

          <div class="card-right">
            <span class="state-badge" [class]="stateOf(m)">{{ stateOf(m) }}</span>
            <div class="actions">
              <a [routerLink]="['/schedule', m.id, 'edit']" class="btn-sm">Edit</a>
              <button (click)="viewAttendance(m)" class="btn-sm">Attendance</button>
              <button (click)="cancel(m)" *ngIf="stateOf(m) !== 'past'" class="btn-sm danger">Cancel</button>
            </div>
          </div>
        </div>
      </div>

      <!-- CALENDAR VIEW -->
      <div *ngIf="!loading() && viewMode() === 'calendar'" class="calendar-wrap">
        <div class="cal-nav">
          <button (click)="prevWeek()" class="nav-btn">‹</button>
          <span class="week-label">{{ weekLabel() }}</span>
          <button (click)="nextWeek()" class="nav-btn">›</button>
          <button (click)="goToday()" class="today-btn">Today</button>
        </div>
        <div class="cal-grid">
          <div *ngFor="let day of weekDays()" class="cal-day">
            <div class="day-header" [class.today]="isToday(day.date)">
              <div class="day-name">{{ day.name }}</div>
              <div class="day-num">{{ day.num }}</div>
            </div>
            <div class="day-sessions">
              <div
                *ngFor="let m of sessionsOnDay(day.date)"
                class="cal-session"
                [class]="stateOf(m)"
                [title]="m.className + ' · ' + m.subjectName"
              >
                <div class="cal-time">{{ istTime(m.date) }}</div>
                <div class="cal-name">{{ m.className }}</div>
                <div class="cal-teacher">{{ m.teacherName }}</div>
              </div>
              <div *ngIf="sessionsOnDay(day.date).length === 0" class="no-session">—</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Attendance modal -->
      <div *ngIf="attendanceModal()" class="modal-backdrop" (click)="attendanceModal.set(null)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Attendance — {{ attendanceModal()!.meeting.className }}</h3>
            <button (click)="attendanceModal.set(null)" class="close-btn">✕</button>
          </div>
          <div class="modal-body">
            <div *ngIf="attendanceModal()!.loading" class="loading">Loading…</div>
            <div *ngIf="!attendanceModal()!.loading">
              <p class="att-count">{{ attendanceModal()!.users.length }} student(s) marked attendance (RSVP)</p>
              <ul class="att-list">
                <li *ngFor="let uid of attendanceModal()!.users">{{ uid }}</li>
              </ul>
              <p *ngIf="attendanceModal()!.users.length === 0" class="muted">No attendance recorded yet.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 1200px; margin: 0 auto; }

    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    h1 { margin: 0; font-size: 22px; font-weight: 700; color: #1e293b; }
    p { margin: 4px 0 0; color: #64748b; font-size: 14px; }

    .header-actions { display: flex; gap: 8px; align-items: center; }

    .view-btn {
      padding: 8px 14px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #fff;
      cursor: pointer;
      font-size: 13px;
      color: #374151;
    }
    .view-btn.active { background: #eff6ff; border-color: #3b82f6; color: #1d4ed8; }

    .btn-primary {
      padding: 9px 16px;
      background: #3b82f6;
      color: #fff;
      border-radius: 8px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
    }

    .filters { display: flex; gap: 10px; margin-bottom: 14px; }

    .filter-select {
      padding: 9px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
    }

    .search-input {
      flex: 1;
      padding: 9px 14px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
    }

    .stats-row { display: flex; gap: 10px; margin-bottom: 20px; }

    .stat-chip {
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
    }
    .stat-chip.live { background: #fee2e2; color: #991b1b; }
    .stat-chip.upcoming { background: #fef3c7; color: #92400e; }
    .stat-chip.past { background: #f1f5f9; color: #475569; }

    .loading { color: #64748b; padding: 20px; }

    .empty { text-align: center; padding: 60px; color: #64748b; }
    .empty span { font-size: 48px; display: block; margin-bottom: 12px; }

    /* Meeting card */
    .meeting-list { display: flex; flex-direction: column; gap: 10px; }

    .meeting-card {
      background: #fff;
      border-radius: 10px;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      border-left: 4px solid #e2e8f0;
    }
    .meeting-card.live { border-left-color: #ef4444; }
    .meeting-card.upcoming { border-left-color: #f59e0b; }
    .meeting-card.past { border-left-color: #94a3b8; opacity: 0.75; }

    .card-left { display: flex; align-items: center; gap: 10px; min-width: 160px; }

    .state-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: #94a3b8;
      flex-shrink: 0;
    }
    .state-dot.live { background: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.2); animation: pulse 1.5s infinite; }
    .state-dot.upcoming { background: #f59e0b; }

    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

    .date { font-weight: 600; font-size: 14px; color: #1e293b; }
    .time { font-size: 12px; color: #64748b; }

    .card-body { flex: 1; }
    .class-name { font-weight: 600; font-size: 15px; color: #1e293b; }
    .subject { font-size: 13px; color: #64748b; margin: 2px 0 6px; }
    .meta-row { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: #64748b; }
    .center-tag, .batch-tag { background: #f1f5f9; padding: 2px 8px; border-radius: 8px; }

    .card-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }

    .state-badge {
      padding: 3px 10px; border-radius: 12px;
      font-size: 11px; font-weight: 700; text-transform: uppercase;
    }
    .state-badge.live { background: #fee2e2; color: #991b1b; }
    .state-badge.upcoming { background: #fef3c7; color: #92400e; }
    .state-badge.past { background: #f1f5f9; color: #64748b; }

    .actions { display: flex; gap: 6px; }

    .btn-sm {
      padding: 5px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #fff;
      font-size: 12px;
      color: #374151;
      cursor: pointer;
      text-decoration: none;
    }
    .btn-sm.danger { border-color: #fca5a5; color: #dc2626; }
    .btn-sm.danger:hover { background: #fef2f2; }

    /* Calendar */
    .calendar-wrap { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); overflow: hidden; }

    .cal-nav {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      border-bottom: 1px solid #e2e8f0;
    }

    .nav-btn, .today-btn {
      padding: 6px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      font-size: 14px;
    }

    .week-label { font-weight: 600; font-size: 15px; color: #1e293b; flex: 1; }

    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); min-height: 300px; }

    .cal-day { border-right: 1px solid #f1f5f9; }
    .cal-day:last-child { border-right: none; }

    .day-header {
      padding: 10px 8px 8px;
      text-align: center;
      border-bottom: 1px solid #f1f5f9;
      background: #f8fafc;
    }
    .day-header.today { background: #eff6ff; }

    .day-name { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; }
    .day-num { font-size: 18px; font-weight: 700; color: #1e293b; }
    .day-header.today .day-num { color: #3b82f6; }

    .day-sessions { padding: 6px; display: flex; flex-direction: column; gap: 4px; }

    .cal-session {
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      background: #fef3c7;
      border-left: 3px solid #f59e0b;
    }
    .cal-session.live { background: #fee2e2; border-left-color: #ef4444; }
    .cal-session.past { background: #f8fafc; border-left-color: #94a3b8; }

    .cal-time { font-weight: 600; color: #1e293b; }
    .cal-name { color: #374151; margin-top: 1px; }
    .cal-teacher { color: #94a3b8; font-size: 10px; }

    .no-session { color: #d1d5db; font-size: 12px; text-align: center; padding: 12px 0; }

    /* Modal */
    .modal-backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      z-index: 100;
    }
    .modal {
      background: #fff;
      border-radius: 14px;
      width: 440px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 20px;
      border-bottom: 1px solid #e2e8f0;
    }
    h3 { margin: 0; font-size: 16px; color: #1e293b; }
    .close-btn { background: none; border: none; font-size: 18px; cursor: pointer; color: #64748b; }
    .modal-body { padding: 20px; overflow-y: auto; }
    .att-count { font-weight: 600; color: #1e293b; margin: 0 0 12px; }
    .att-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
    .att-list li { padding: 8px 12px; background: #f8fafc; border-radius: 6px; font-size: 13px; color: #374151; font-family: monospace; }
    .muted { color: #94a3b8; font-size: 13px; }
  `],
})
export class ScheduleListComponent implements OnInit {
  private service = inject(ScheduleService);
  auth = inject(AdminAuthService);

  meetings = signal<Meeting[]>([]);
  loading = signal(true);
  viewMode = signal<'list' | 'calendar'>('list');
  filterState = '';
  filterText = '';

  attendanceModal = signal<{ meeting: Meeting; loading: boolean; users: string[] } | null>(null);

  // Calendar
  weekStart = signal(this.mondayOf(new Date()));

  filtered = computed(() => {
    let list = this.meetings();
    if (this.filterState) list = list.filter(m => this.stateOf(m) === this.filterState);
    if (this.filterText) {
      const q = this.filterText.toLowerCase();
      list = list.filter(m =>
        (m.className ?? '').toLowerCase().includes(q) ||
        (m.subjectName ?? '').toLowerCase().includes(q) ||
        m.teacherName.toLowerCase().includes(q) ||
        (m.centerId ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  });

  async ngOnInit() {
    // Scoped server-side: admins get a 7-day-back window across the platform,
    // teachers only ever receive documents where they are the assigned teacher.
    const res = await this.service.listForCurrentUser();
    this.meetings.set(res.data ?? []);
    this.loading.set(false);
  }

  stateOf(m: Meeting): SessionState { return sessionState(m); }
  istDate(ts: import('@angular/fire/firestore').Timestamp) { return toISTDateStr(ts); }
  istTime(ts: import('@angular/fire/firestore').Timestamp) { return toISTTimeStr(ts); }

  countByState(s: SessionState) {
    return this.meetings().filter(m => this.stateOf(m) === s).length;
  }

  async cancel(m: Meeting) {
    if (!confirm(`Cancel "${m.className}" session on ${this.istDate(m.date)}?`)) return;
    await this.service.cancelMeeting(m.id);
    this.meetings.update(list => list.filter(x => x.id !== m.id));
  }

  async viewAttendance(m: Meeting) {
    this.attendanceModal.set({ meeting: m, loading: true, users: [] });
    const res = await this.service.getAttendance(m.classId);
    this.attendanceModal.set({ meeting: m, loading: false, users: res?.users ?? [] });
  }

  // Calendar helpers
  mondayOf(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  weekDays = computed(() => {
    const mon = this.weekStart();
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((name, i) => {
      const d = new Date(mon);
      d.setDate(d.getDate() + i);
      return { name, num: d.getDate(), date: d };
    });
  });

  weekLabel = computed(() => {
    const days = this.weekDays();
    const first = days[0].date;
    const last = days[6].date;
    return `${first.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  });

  sessionsOnDay(date: Date): Meeting[] {
    const dateStr = date.toISOString().slice(0, 10);
    return this.meetings().filter(m => toISTDateStr(m.date) === dateStr);
  }

  isToday(date: Date) {
    return date.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  }

  prevWeek() { this.weekStart.update(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }); }
  nextWeek() { this.weekStart.update(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }); }
  goToday() { this.weekStart.set(this.mondayOf(new Date())); }
}
