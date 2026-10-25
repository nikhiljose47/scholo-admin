import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ScheduleService } from './schedule.service';
import { Meeting, sessionState, SessionState } from '../../models/schedule/meeting.model';
import { toISTDateStr, toISTTime12Str, toISTDateLabel } from './schedule.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'app-schedule-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, IconComponent],
  template: `
    <div class="page">

      <!-- Header -->
      <header class="page-header">
        <div>
          <h1 class="page-title">Class Schedule</h1>
          <p class="page-subtitle">{{ auth.isAdmin() ? 'All sessions across every center and batch' : 'Your scheduled sessions' }}</p>
        </div>
        <div class="header-actions">
          <!-- View toggle -->
          <div class="view-toggle" role="group" aria-label="View mode">
            <button
              (click)="viewMode.set('list')"
              [class.active]="viewMode() === 'list'"
              class="toggle-btn"
            >
              <sc-icon name="clipboard" [size]="14"></sc-icon>
              List
            </button>
            <button
              (click)="viewMode.set('calendar')"
              [class.active]="viewMode() === 'calendar'"
              class="toggle-btn"
            >
              <sc-icon name="calendar" [size]="14"></sc-icon>
              Week
            </button>
          </div>
          <a routerLink="/schedule/new" class="btn btn-primary">
            <sc-icon name="plus" [size]="15" [stroke]="2.5"></sc-icon>
            Schedule Class
          </a>
        </div>
      </header>

      <!-- Toolbar -->
      <div class="toolbar">
        <!-- Stats chips -->
        <div class="stat-chips">
          <div class="stat-chip live" [class.active]="filterState === 'live'" (click)="toggleFilter('live')">
            <span class="chip-dot"></span>
            {{ countByState('live') }} Live
          </div>
          <div class="stat-chip upcoming" [class.active]="filterState === 'upcoming'" (click)="toggleFilter('upcoming')">
            <span class="chip-dot"></span>
            {{ countByState('upcoming') }} Upcoming
          </div>
          <div class="stat-chip past" [class.active]="filterState === 'past'" (click)="toggleFilter('past')">
            <span class="chip-dot"></span>
            {{ countByState('past') }} Past
          </div>
        </div>

        <!-- Search -->
        <div class="search-wrap">
          <sc-icon name="search" [size]="15" class="search-icon"></sc-icon>
          <input
            type="search"
            [(ngModel)]="filterText"
            placeholder="Search class, subject, teacher…"
            class="search-input"
          />
        </div>
      </div>

      <div *ngIf="loading()" class="loading-state">Loading sessions</div>

      <!-- LIST VIEW -->
      <ng-container *ngIf="!loading() && viewMode() === 'list'">

        <!-- Empty state -->
        <div *ngIf="filtered().length === 0" class="empty-state">
          <sc-icon name="calendar" [size]="40" [stroke]="1"></sc-icon>
          <p class="empty-title">No sessions found</p>
          <p class="empty-body">{{ filterState || filterText ? 'Try changing your filters.' : 'Get started by scheduling a class.' }}</p>
          <a *ngIf="!filterState && !filterText" routerLink="/schedule/new" class="btn btn-primary">Schedule a class</a>
        </div>

        <div class="meeting-list" *ngIf="filtered().length > 0">
          <div *ngFor="let m of filtered()" class="meeting-row card">

            <!-- State indicator -->
            <div class="row-state" [class]="stateOf(m)">
              <span class="state-dot" [class]="stateOf(m)"></span>
            </div>

            <!-- Date/time -->
            <div class="row-datetime">
              <div class="row-date">{{ istDateLabel(m.date) }}</div>
              <div class="row-time">{{ ist12Time(m.date) }} — {{ ist12Time(m.endAt) }}</div>
            </div>

            <!-- Main content -->
            <div class="row-body">
              <div class="row-title">{{ m.className || m.classId }}</div>
              <div class="row-sub">{{ m.subjectName || m.subjectId }}
                <ng-container *ngIf="m.chapterName || m.chapterCode">
                  · {{ m.chapterName || m.chapterCode }}
                </ng-container>
              </div>
              <div class="row-meta">
                <span class="meta-item">
                  <sc-icon name="person" [size]="11" [stroke]="1.5"></sc-icon>
                  {{ m.teacherName }}
                </span>
                <span class="meta-item" *ngIf="m.centerId">
                  <sc-icon name="buildings" [size]="11" [stroke]="1.5"></sc-icon>
                  {{ m.centerId }}
                </span>
                <span class="tag tag-neutral" *ngIf="m.batchId !== 'default'">{{ m.batchId }}</span>
                <span class="meta-item muted">{{ m.duration }} min</span>
              </div>
            </div>

            <!-- Right: badge + actions -->
            <div class="row-actions">
              <span
                class="badge"
                [class.badge-live]="stateOf(m) === 'live'"
                [class.badge-upcoming]="stateOf(m) === 'upcoming'"
                [class.badge-past]="stateOf(m) === 'past'"
              >{{ stateOf(m) }}</span>
              <div class="action-btns">
                <a [routerLink]="['/schedule', m.id, 'edit']" class="btn btn-ghost btn-sm">Edit</a>
                <button (click)="viewAttendance(m)" class="btn btn-ghost btn-sm">Attendance</button>
                <button
                  (click)="cancel(m)"
                  *ngIf="stateOf(m) !== 'past'"
                  class="btn btn-danger btn-sm"
                >Cancel</button>
              </div>
            </div>

          </div>
        </div>
      </ng-container>

      <!-- CALENDAR VIEW -->
      <div *ngIf="!loading() && viewMode() === 'calendar'" class="calendar-wrap card">

        <div class="cal-nav">
          <button (click)="prevWeek()" class="btn btn-ghost btn-sm">
            <sc-icon name="chevron-left" [size]="14" [stroke]="2"></sc-icon>
          </button>
          <span class="week-label">{{ weekLabel() }}</span>
          <button (click)="nextWeek()" class="btn btn-ghost btn-sm">
            <sc-icon name="chevron-right" [size]="14" [stroke]="2"></sc-icon>
          </button>
          <button (click)="goToday()" class="btn btn-secondary btn-sm">Today</button>
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
                [title]="(m.className || m.classId) + ' · ' + (m.subjectName || m.subjectId)"
                (click)="viewAttendance(m)"
              >
                <div class="cal-time">{{ ist12Time(m.date) }}</div>
                <div class="cal-name">{{ m.className || m.classId }}</div>
                <div class="cal-teacher">{{ m.teacherName }}</div>
              </div>
              <div *ngIf="sessionsOnDay(day.date).length === 0" class="no-session">–</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Attendance modal -->
      <div *ngIf="attendanceModal()" class="modal-backdrop" (click)="attendanceModal.set(null)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div>
              <h3>Attendance — {{ attendanceModal()!.meeting.className || attendanceModal()!.meeting.classId }}</h3>
              <p class="modal-subtitle">{{ istDateLabel(attendanceModal()!.meeting.date) }} · {{ ist12Time(attendanceModal()!.meeting.date) }}</p>
            </div>
            <button (click)="attendanceModal.set(null)" class="btn btn-ghost btn-sm icon-only">
              <sc-icon name="x" [size]="15" [stroke]="2"></sc-icon>
            </button>
          </div>
          <div class="modal-body">
            <div *ngIf="attendanceModal()!.loading" class="loading-state">Loading</div>
            <ng-container *ngIf="!attendanceModal()!.loading">
              <p class="att-count">{{ attendanceModal()!.users.length }} student(s) marked attendance</p>
              <ul class="att-list" *ngIf="attendanceModal()!.users.length > 0">
                <li *ngFor="let uid of attendanceModal()!.users" class="att-item">{{ uid }}</li>
              </ul>
              <p *ngIf="attendanceModal()!.users.length === 0" class="att-empty">No attendance recorded yet.</p>
            </ng-container>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    /* ── Toolbar ── */
    .stat-chips {
      display: flex;
      gap: 6px;
    }

    .stat-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: var(--r-full);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background var(--dur-base), border-color var(--dur-base);
      user-select: none;
    }

    .stat-chip.live { background: var(--live-bg); color: var(--live-text); }
    .stat-chip.upcoming { background: var(--up-bg); color: var(--up-text); }
    .stat-chip.past { background: var(--past-bg); color: var(--past-text); }
    .stat-chip.active { border-color: currentColor; }

    .chip-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }

    .stat-chip.live .chip-dot { animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

    /* Search */
    .search-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: 10px;
      color: var(--text-placeholder);
      pointer-events: none;
    }

    .search-input {
      height: var(--ctrl-md);
      width: 260px;
      padding: 0 12px 0 34px;
      background: var(--surface-primary);
      border: 1px solid var(--border-default);
      border-radius: var(--r-sm);
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
      transition: border-color var(--dur-base), box-shadow var(--dur-base);
    }

    .search-input::placeholder { color: var(--text-placeholder); }
    .search-input:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--border-focus-ring);
    }

    /* View toggle */
    .view-toggle {
      display: flex;
      background: var(--surface-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--r-sm);
      padding: 3px;
      gap: 2px;
    }

    .toggle-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      height: 28px;
      padding: 0 10px;
      border-radius: var(--r-xs);
      border: none;
      background: none;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background var(--dur-base), color var(--dur-base);
    }

    .toggle-btn.active {
      background: var(--surface-primary);
      color: var(--text-primary);
      box-shadow: var(--shadow-xs);
    }

    /* ── Meeting list ── */
    .meeting-list { display: flex; flex-direction: column; gap: 6px; }

    .meeting-row {
      display: flex;
      align-items: center;
      gap: 0;
      padding: 0;
      overflow: hidden;
    }

    .row-state {
      width: 4px;
      align-self: stretch;
      flex-shrink: 0;
    }
    .row-state.live { background: var(--live-dot); }
    .row-state.upcoming { background: var(--up-dot); }
    .row-state.past { background: var(--past-dot); }

    .state-dot { display: none; }

    .row-datetime {
      padding: 14px 16px;
      min-width: 140px;
      flex-shrink: 0;
      border-right: 1px solid var(--border-subtle);
    }

    .row-date {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .row-time {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
      white-space: nowrap;
    }

    .row-body {
      flex: 1;
      padding: 12px 16px;
      min-width: 0;
    }

    .row-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .row-sub {
      font-size: 12px;
      color: var(--text-muted);
      margin: 2px 0 6px;
    }

    .row-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }

    .meta-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .meta-item.muted { color: var(--text-placeholder); }

    .row-actions {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      padding: 12px 16px;
      flex-shrink: 0;
    }

    .action-btns {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .icon-only { padding: 0; width: 30px; height: 30px; }

    /* ── Calendar ── */
    .calendar-wrap { overflow: hidden; padding: 0; }

    .cal-nav {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .week-label {
      flex: 1;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      min-height: 320px;
    }

    .cal-day { border-right: 1px solid var(--border-subtle); }
    .cal-day:last-child { border-right: none; }

    .day-header {
      padding: 10px 8px 8px;
      text-align: center;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--surface-secondary);
    }

    .day-header.today { background: var(--brand-subtle); }

    .day-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-placeholder);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .day-num {
      font-size: 17px;
      font-weight: 700;
      color: var(--text-primary);
      margin-top: 2px;
    }

    .day-header.today .day-num { color: var(--brand); }

    .day-sessions { padding: 6px; display: flex; flex-direction: column; gap: 4px; }

    .cal-session {
      padding: 7px 8px;
      border-radius: var(--r-sm);
      font-size: 11px;
      cursor: pointer;
      border-left: 3px solid var(--up-dot);
      background: var(--up-bg);
      transition: opacity var(--dur-base);
    }
    .cal-session:hover { opacity: 0.8; }
    .cal-session.live { background: var(--live-bg); border-left-color: var(--live-dot); }
    .cal-session.past { background: var(--past-bg); border-left-color: var(--past-dot); }

    .cal-time { font-weight: 600; color: var(--text-primary); }
    .cal-name { color: var(--text-secondary); margin-top: 1px; }
    .cal-teacher { color: var(--text-muted); font-size: 10px; margin-top: 1px; }

    .no-session {
      color: var(--border-strong);
      font-size: 12px;
      text-align: center;
      padding: 14px 0;
    }

    /* ── Attendance modal ── */
    .modal-subtitle {
      margin: 2px 0 0;
      font-size: 12px;
      color: var(--text-muted);
    }

    .att-count {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 14px;
    }

    .att-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .att-item {
      padding: 8px 12px;
      background: var(--surface-secondary);
      border-radius: var(--r-sm);
      font-size: 12px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
    }

    .att-empty {
      font-size: 13px;
      color: var(--text-muted);
      margin: 0;
    }
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
    const res = await this.service.listForCurrentUser();
    this.meetings.set(res.data ?? []);
    this.loading.set(false);
  }

  stateOf(m: Meeting): SessionState { return sessionState(m); }
  istDate(ts: import('@angular/fire/firestore').Timestamp) { return toISTDateStr(ts); }
  istDateLabel(ts: import('@angular/fire/firestore').Timestamp) { return toISTDateLabel(ts); }
  ist12Time(ts: import('@angular/fire/firestore').Timestamp) { return toISTTime12Str(ts); }

  countByState(s: SessionState) {
    return this.meetings().filter(m => this.stateOf(m) === s).length;
  }

  toggleFilter(s: SessionState) {
    this.filterState = this.filterState === s ? '' : s;
  }

  async cancel(m: Meeting) {
    if (!confirm(`Cancel "${m.className}" session on ${this.istDate(m.date)}?`)) return;
    await this.service.cancelMeeting(m.id);
    this.meetings.update(list => list.filter(x => x.id !== m.id));
  }

  viewAttendance(m: Meeting) {
    // Each meeting carries its own per-session attendance list (managed by the
    // Worker RSVP flow directly on this document) — using it here instead of a
    // classId-keyed lookup is what makes the count specific to *this* session
    // rather than showing the same class-wide total for every scheduled session.
    this.attendanceModal.set({ meeting: m, loading: false, users: m.attendance ?? [] });
  }

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
