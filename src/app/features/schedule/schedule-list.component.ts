import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Timestamp } from '@angular/fire/firestore';
import { ScheduleService } from './schedule.service';
import { Meeting, sessionState, SessionState } from '../../models/schedule/meeting.model';
import { toISTDateStr, toISTTime12Str, toISTDateLabel } from './schedule.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { SessionWrapUpService } from './session-wrap-up.service';
import { SessionAssessmentEntryComponent } from './session-assessment-entry.component';
import { StudentSessionResultsListComponent } from './student-session-results-list.component';
import { ClassWrapupComponent } from './class-wrapup.component';
import { SessionImportRow, StudentSessionResult, RosterEntry } from '../../models/schedule/session-result.model';

@Component({
  selector: 'app-schedule-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    IconComponent,
    SessionAssessmentEntryComponent,
    StudentSessionResultsListComponent,
    ClassWrapupComponent,
  ],
  template: `
    <div class="page">

      <!-- Header -->
      <header class="page-header">
        <div>
          <h1 class="page-title">Class Schedule</h1>
          <p class="page-subtitle">{{ auth.isAdmin() ? 'All sessions across every center and batch' : 'Your scheduled sessions' }}</p>
        </div>
        <div class="header-actions">
          <div *ngIf="!selectedMeeting()" class="view-toggle" role="group" aria-label="View mode">
            <button (click)="viewMode.set('list')" [class.active]="viewMode() === 'list'" class="toggle-btn">
              <sc-icon name="clipboard" [size]="14"></sc-icon> List
            </button>
            <button (click)="viewMode.set('calendar')" [class.active]="viewMode() === 'calendar'" class="toggle-btn">
              <sc-icon name="calendar" [size]="14"></sc-icon> Week
            </button>
          </div>
          <a routerLink="/schedule/new" class="btn btn-primary">
            <sc-icon name="plus" [size]="15" [stroke]="2.5"></sc-icon>
            Schedule Class
          </a>
        </div>
      </header>

      <!-- Toast -->
      <div *ngIf="toast()" class="toast" [class.toast-error]="toast()!.type === 'error'">
        {{ toast()!.msg }}
      </div>

      <!-- ── Teacher meeting strip ── -->
      <ng-container *ngIf="auth.isTeacher()">
        <div class="strip-wrap">
          <div class="meeting-strip">
            <!-- New session card -->
            <a routerLink="/schedule/new" class="strip-card strip-new">
              <sc-icon name="plus" [size]="22" [stroke]="1.5"></sc-icon>
              <span>Schedule<br>Class</span>
            </a>

            <div *ngIf="loading()" class="strip-card strip-loading">Loading…</div>

            <!-- Meeting cards -->
            <div
              *ngFor="let m of stripMeetings()"
              class="strip-card"
              [class.strip-selected]="selectedMeeting()?.id === m.id"
              [class.strip-completed]="m.status === 'completed'"
              (click)="selectMeeting(m)"
            >
              <div class="strip-state" [class]="stateOf(m)">
                <span class="strip-dot" [class]="stateOf(m)"></span>
                {{ stateOf(m) }}
              </div>
              <div class="strip-class">{{ m.className || m.classId }}</div>
              <div class="strip-sub">{{ m.subjectName || m.subjectId }}</div>
              <div class="strip-time">{{ istTime(m.date) }}</div>
            </div>
          </div>
        </div>

        <!-- Detail panel (teacher) -->
        <div *ngIf="selectedMeeting()" class="detail-panel card">
          <div class="detail-header">
            <div>
              <span class="detail-title">{{ selectedMeeting()!.className || selectedMeeting()!.classId }}</span>
              <span class="detail-date"> · {{ istDate(selectedMeeting()!.date) }}</span>
            </div>
            <button class="btn btn-ghost btn-sm" (click)="closeMeeting()">
              <sc-icon name="x" [size]="14" [stroke]="2"></sc-icon>
              Close
            </button>
          </div>

          <div class="detail-body">

            <!-- Section 1 & 2: Import / Results -->
            <div class="detail-section">
              <div *ngIf="resultsLoading()" class="loading-state">Loading results…</div>

              <div *ngIf="!resultsLoading() && !results().length">
                <button
                  class="btn btn-secondary"
                  [disabled]="rosterLoading()"
                  (click)="showImportModal.set(true)"
                >
                  <sc-icon name="clipboard" [size]="14"></sc-icon>
                  {{ rosterLoading() ? 'Loading roster…' : 'Import Assessments' }}
                </button>
              </div>

              <div *ngIf="!resultsLoading() && results().length" class="results-section">
                <app-student-session-results-list
                  [data]="results()"
                  (refetch)="showImportModal.set(true)"
                />
              </div>
            </div>

            <!-- Section 3: Class wrap-up -->
            <div class="detail-section">
              <app-class-wrapup
                [meeting]="selectedMeeting()!"
                [roster]="roster()"
                [rosterLoading]="rosterLoading()"
                [saving]="submitting()"
                (submit)="handleSubmit($event)"
              />
            </div>

          </div>
        </div>
      </ng-container>

      <!-- ── Admin / shared list+calendar ── (always shown for admins, shown when no meeting selected for teachers) -->
      <ng-container *ngIf="auth.isAdmin() || !selectedMeeting()">

        <div *ngIf="loading()" class="loading-state">Loading sessions</div>

        <ng-container *ngIf="!loading()">
          <!-- Toolbar -->
          <div class="toolbar">
            <div class="stat-chips">
              <div class="stat-chip live" [class.active]="filterState === 'live'" (click)="toggleFilter('live')">
                <span class="chip-dot"></span>{{ countByState('live') }} Live
              </div>
              <div class="stat-chip upcoming" [class.active]="filterState === 'upcoming'" (click)="toggleFilter('upcoming')">
                <span class="chip-dot"></span>{{ countByState('upcoming') }} Upcoming
              </div>
              <div class="stat-chip past" [class.active]="filterState === 'past'" (click)="toggleFilter('past')">
                <span class="chip-dot"></span>{{ countByState('past') }} Past
              </div>
            </div>
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

          <!-- LIST VIEW -->
          <ng-container *ngIf="viewMode() === 'list'">
            <div *ngIf="filtered().length === 0" class="empty-state">
              <sc-icon name="calendar" [size]="40" [stroke]="1"></sc-icon>
              <p class="empty-title">No sessions found</p>
              <p class="empty-body">{{ filterState || filterText ? 'Try changing your filters.' : 'Get started by scheduling a class.' }}</p>
              <a *ngIf="!filterState && !filterText" routerLink="/schedule/new" class="btn btn-primary">Schedule a class</a>
            </div>

            <div class="meeting-list" *ngIf="filtered().length > 0">
              <div *ngFor="let m of filtered()" class="meeting-row card">
                <div class="row-state" [class]="stateOf(m)"></div>
                <div class="row-datetime">
                  <div class="row-date">{{ istDateLabel(m.date) }}</div>
                  <div class="row-time">{{ ist12Time(m.date) }} — {{ ist12Time(m.endAt) }}</div>
                </div>
                <div class="row-body">
                  <div class="row-title">{{ m.className || m.classId }}</div>
                  <div class="row-sub">{{ m.subjectName || m.subjectId }}
                    <ng-container *ngIf="m.chapterName || m.chapterCode"> · {{ m.chapterName || m.chapterCode }}</ng-container>
                  </div>
                  <div class="row-meta">
                    <span class="meta-item"><sc-icon name="person" [size]="11" [stroke]="1.5"></sc-icon>{{ m.teacherName }}</span>
                    <span class="meta-item" *ngIf="m.centerId"><sc-icon name="buildings" [size]="11" [stroke]="1.5"></sc-icon>{{ m.centerId }}</span>
                    <span class="tag tag-neutral" *ngIf="m.batchId !== 'default'">{{ m.batchId }}</span>
                    <span class="meta-item muted">{{ m.duration }} min</span>
                  </div>
                </div>
                <div class="row-actions">
                  <span class="badge" [class.badge-live]="stateOf(m) === 'live'" [class.badge-upcoming]="stateOf(m) === 'upcoming'" [class.badge-past]="stateOf(m) === 'past'">{{ stateOf(m) }}</span>
                  <div class="action-btns">
                    <a [routerLink]="['/schedule', m.id, 'edit']" class="btn btn-ghost btn-sm">Edit</a>
                    <button (click)="viewAttendance(m)" class="btn btn-ghost btn-sm">Attendance</button>
                    <button *ngIf="auth.isTeacher()" (click)="selectMeeting(m)" class="btn btn-secondary btn-sm">Wrap Up</button>
                    <button (click)="cancel(m)" *ngIf="stateOf(m) !== 'past'" class="btn btn-danger btn-sm">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          </ng-container>

          <!-- CALENDAR VIEW -->
          <div *ngIf="viewMode() === 'calendar'" class="calendar-wrap card">
            <div class="cal-nav">
              <button (click)="prevWeek()" class="btn btn-ghost btn-sm"><sc-icon name="chevron-left" [size]="14" [stroke]="2"></sc-icon></button>
              <span class="week-label">{{ weekLabel() }}</span>
              <button (click)="nextWeek()" class="btn btn-ghost btn-sm"><sc-icon name="chevron-right" [size]="14" [stroke]="2"></sc-icon></button>
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
                    <div class="cal-time">{{ istTime(m.date) }}</div>
                    <div class="cal-name">{{ m.className || m.classId }}</div>
                    <div class="cal-teacher">{{ m.teacherName }}</div>
                  </div>
                  <div *ngIf="sessionsOnDay(day.date).length === 0" class="no-session">–</div>
                </div>
              </div>
            </div>
          </div>
        </ng-container>

      </ng-container>

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

      <!-- Import modal -->
      <app-session-assessment-entry
        *ngIf="showImportModal()"
        [roster]="roster()"
        (closeEvent)="showImportModal.set(false)"
        (importEvent)="handleImport($event)"
      />

    </div>
  `,
  styles: [`
    /* ── Toast ── */
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      padding: 12px 20px;
      background: var(--live-bg, #f6ffed);
      color: var(--live-text, #389e0d);
      border: 1px solid var(--live-dot, #52c41a);
      border-radius: var(--r-sm);
      font-size: 13px;
      font-weight: 600;
      box-shadow: var(--shadow-md);
    }
    .toast.toast-error {
      background: var(--danger-subtle, #fff1f0);
      color: var(--danger, #cf1322);
      border-color: var(--danger-border, #ffa39e);
    }

    /* ── Teacher meeting strip ── */
    .strip-wrap {
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .meeting-strip {
      display: flex;
      gap: 10px;
      min-width: max-content;
    }

    .strip-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 14px;
      width: 160px;
      flex-shrink: 0;
      border-radius: var(--r-md);
      background: var(--surface-primary);
      border: 1px solid var(--border-default);
      cursor: pointer;
      transition: border-color var(--dur-base), box-shadow var(--dur-base);
      text-decoration: none;
    }

    .strip-card:hover { border-color: var(--brand); box-shadow: var(--shadow-sm); }

    .strip-card.strip-selected {
      border-color: var(--brand);
      box-shadow: 0 0 0 2px var(--brand-subtle, rgba(22,119,255,0.15));
    }

    .strip-card.strip-completed { opacity: 0.65; }

    .strip-new {
      align-items: center;
      justify-content: center;
      color: var(--brand);
      font-size: 13px;
      font-weight: 600;
      gap: 6px;
      text-align: center;
      width: 100px;
    }

    .strip-loading { align-items: center; justify-content: center; color: var(--text-muted); font-size: 12px; }

    .strip-state {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .strip-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }

    .strip-state.live { color: var(--live-dot, #52c41a); }
    .strip-state.upcoming { color: var(--up-dot, #1677ff); }
    .strip-state.past { color: var(--past-dot, #bfbfbf); }

    .strip-class {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .strip-sub {
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .strip-time {
      font-size: 11px;
      color: var(--text-placeholder);
      margin-top: 2px;
    }

    /* ── Detail panel ── */
    .detail-panel { padding: 0; overflow: hidden; }

    .detail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border-subtle);
      gap: 12px;
    }

    .detail-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
    .detail-date { font-size: 13px; color: var(--text-muted); }

    .detail-body {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      min-height: 300px;
    }

    @media (max-width: 700px) {
      .detail-body { grid-template-columns: 1fr; }
    }

    .detail-section {
      padding: 20px;
    }

    .detail-section + .detail-section {
      border-left: 1px solid var(--border-subtle);
    }

    @media (max-width: 700px) {
      .detail-section + .detail-section { border-left: none; border-top: 1px solid var(--border-subtle); }
    }

    .results-section { display: flex; flex-direction: column; gap: 12px; }

    /* ── Toolbar ── */
    .stat-chips { display: flex; gap: 6px; flex-wrap: wrap; }

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

    .chip-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
    .stat-chip.live .chip-dot { animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

    /* Search */
    .search-wrap { position: relative; display: flex; align-items: center; }
    .search-icon { position: absolute; left: 10px; color: var(--text-placeholder); pointer-events: none; }
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
    .search-input:focus { border-color: var(--border-focus); box-shadow: 0 0 0 3px var(--border-focus-ring); }

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
    .toggle-btn.active { background: var(--surface-primary); color: var(--text-primary); box-shadow: var(--shadow-xs); }

    /* ── Meeting list ── */
    .meeting-list { display: flex; flex-direction: column; gap: 6px; }

    .meeting-row { display: flex; align-items: center; gap: 0; padding: 0; overflow: hidden; }

    .row-state { width: 4px; align-self: stretch; flex-shrink: 0; }
    .row-state.live { background: var(--live-dot); }
    .row-state.upcoming { background: var(--up-dot); }
    .row-state.past { background: var(--past-dot); }

    .row-datetime { padding: 14px 16px; min-width: 140px; flex-shrink: 0; border-right: 1px solid var(--border-subtle); }
    .row-date { font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .row-time { font-size: 11px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; }

    .row-body { flex: 1; padding: 12px 16px; min-width: 0; }
    .row-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
    .row-sub { font-size: 12px; color: var(--text-muted); margin: 2px 0 6px; }
    .row-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .meta-item { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-muted); }
    .meta-item.muted { color: var(--text-placeholder); }

    .row-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; padding: 12px 16px; flex-shrink: 0; }
    .action-btns { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }

    .icon-only { padding: 0; width: 30px; height: 30px; }

    /* ── Calendar ── */
    .calendar-wrap { overflow: hidden; padding: 0; }
    .cal-nav { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); }
    .week-label { flex: 1; font-size: 14px; font-weight: 600; color: var(--text-primary); }
    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); min-height: 320px; }
    .cal-day { border-right: 1px solid var(--border-subtle); }
    .cal-day:last-child { border-right: none; }
    .day-header { padding: 10px 8px 8px; text-align: center; border-bottom: 1px solid var(--border-subtle); background: var(--surface-secondary); }
    .day-header.today { background: var(--brand-subtle); }
    .day-name { font-size: 11px; font-weight: 600; color: var(--text-placeholder); text-transform: uppercase; letter-spacing: 0.05em; }
    .day-num { font-size: 17px; font-weight: 700; color: var(--text-primary); margin-top: 2px; }
    .day-header.today .day-num { color: var(--brand); }
    .day-sessions { padding: 6px; display: flex; flex-direction: column; gap: 4px; }
    .cal-session { padding: 7px 8px; border-radius: var(--r-sm); font-size: 11px; cursor: pointer; border-left: 3px solid var(--up-dot); background: var(--up-bg); transition: opacity var(--dur-base); }
    .cal-session:hover { opacity: 0.8; }
    .cal-session.live { background: var(--live-bg); border-left-color: var(--live-dot); }
    .cal-session.past { background: var(--past-bg); border-left-color: var(--past-dot); }
    .cal-time { font-weight: 600; color: var(--text-primary); }
    .cal-name { color: var(--text-secondary); margin-top: 1px; }
    .cal-teacher { color: var(--text-muted); font-size: 10px; margin-top: 1px; }
    .no-session { color: var(--border-strong); font-size: 12px; text-align: center; padding: 14px 0; }

    /* ── Attendance modal ── */
    .modal-subtitle {
      margin: 2px 0 0;
      font-size: 12px;
      color: var(--text-muted);
    }

    .att-count { font-size: 13px; font-weight: 600; color: var(--text-primary); margin: 0 0 14px; }
    .att-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
    .att-item { padding: 8px 12px; background: var(--surface-secondary); border-radius: var(--r-sm); font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono); }
    .att-empty { font-size: 13px; color: var(--text-muted); margin: 0; }

    /* ── Responsive ── */
    @media (max-width: 600px) {
      .row-datetime { min-width: 100px; padding: 10px 10px; }
      .row-actions { padding: 10px 10px; }
      .search-input { width: 100%; }
      .cal-grid { grid-template-columns: repeat(3, 1fr); }
    }
  `],
})
export class ScheduleListComponent implements OnInit {
  private service = inject(ScheduleService);
  private wrapUpService = inject(SessionWrapUpService);
  auth = inject(AdminAuthService);

  meetings = signal<Meeting[]>([]);
  loading = signal(true);
  viewMode = signal<'list' | 'calendar'>('list');
  filterState = '';
  filterText = '';

  attendanceModal = signal<{ meeting: Meeting; loading: boolean; users: string[] } | null>(null);
  weekStart = signal(this.mondayOf(new Date()));

  // Session wrap-up state
  selectedMeeting = signal<Meeting | null>(null);
  roster = signal<RosterEntry[]>([]);
  rosterLoading = signal(false);
  results = signal<StudentSessionResult[]>([]);
  resultsLoading = signal(false);
  showImportModal = signal(false);
  submitting = signal(false);
  toast = signal<{ msg: string; type: 'success' | 'error' } | null>(null);

  /** Meetings shown in teacher strip: sorted live → upcoming → past. */
  readonly stripMeetings = computed(() =>
    [...this.meetings()].sort((a, b) => {
      const order = (m: Meeting) => {
        const s = sessionState(m);
        return s === 'live' ? 0 : s === 'upcoming' ? 1 : 2;
      };
      const diff = order(a) - order(b);
      if (diff !== 0) return diff;
      return b.date.toMillis() - a.date.toMillis();
    }),
  );

  readonly filtered = computed(() => {
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
  istDate(ts: Timestamp) { return toISTDateStr(ts); }
  istDateLabel(ts: Timestamp) { return toISTDateLabel(ts); }
  ist12Time(ts: Timestamp) { return toISTTime12Str(ts); }
  istTime(ts: Timestamp) { return toISTTime12Str(ts); }

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

  async selectMeeting(m: Meeting) {
    this.selectedMeeting.set(m);
    this.results.set([]);
    this.roster.set([]);

    // Load existing results and roster in parallel
    this.resultsLoading.set(true);
    const [resLoad] = await Promise.all([
      this.wrapUpService.loadResults(m.id),
      this.loadRoster(m),
    ]);
    this.results.set(resLoad.data ?? []);
    this.resultsLoading.set(false);
  }

  private async loadRoster(m: Meeting) {
    if (!m.centerId || !m.batchId || m.batchId === 'default') return;
    this.rosterLoading.set(true);
    const roster = await this.wrapUpService.loadRoster(m.centerId, m.batchId);
    this.roster.set(roster);
    this.rosterLoading.set(false);
  }

  closeMeeting() {
    this.selectedMeeting.set(null);
    this.results.set([]);
    this.roster.set([]);
    this.showImportModal.set(false);
  }

  async handleImport(rows: SessionImportRow[]) {
    const m = this.selectedMeeting();
    if (!m) return;

    const ts = Timestamp.fromMillis(Date.now());
    const studentResults: StudentSessionResult[] = rows.map(r => ({
      studentUid: r.studentId, // validated by modal against roster (uid === studentId)
      studentId: r.studentId,
      sessionId: m.id,
      subjectId: m.subjectId,
      chapterCode: m.chapterCode,
      divisionCode: m.batchId,
      sessionType: 'class' as const,
      assignmentMarks: r.assignmentMarks,
      maxMarks: r.maxMarks,
      engagementScore: r.engagementScore,
      remarks: r.remarks,
      createdAt: ts,
    }));

    const saveRes = await this.wrapUpService.saveResults(studentResults);
    if (saveRes.ok) {
      // Merge with existing results: replace by studentId, keep anything else
      const newById = new Map(studentResults.map(r => [r.studentId ?? r.studentUid, r]));
      const merged = [
        ...this.results().filter(r => !newById.has(r.studentId ?? r.studentUid)),
        ...studentResults,
      ];
      this.results.set(merged);
      this.showToast('Results imported successfully', 'success');
    } else {
      this.showToast(saveRes.message ?? 'Failed to save results', 'error');
    }
  }

  async handleSubmit(payload: { attendance: string[]; feedback: string }) {
    const m = this.selectedMeeting();
    if (!m) return;

    const confirmed = confirm(
      'Are you sure you want to submit?\n\n' +
      'This will mark the class as completed and cannot be undone unless admin intervention is done.',
    );
    if (!confirmed) return;

    this.submitting.set(true);
    const res = await this.wrapUpService.submitClass({
      meetingId: m.id,
      results: this.results(),
      attendance: payload.attendance,
      feedback: payload.feedback,
    });
    this.submitting.set(false);

    if (res.ok) {
      // Reflect completion in local meeting state
      const updated: Meeting = {
        ...m,
        attendance: payload.attendance,
        feedback: payload.feedback,
        endAt: Timestamp.fromMillis(Date.now()),
        status: 'completed',
      };
      this.selectedMeeting.set(updated);
      this.meetings.update(list => list.map(x => x.id === m.id ? updated : x));
      this.showToast('Class submitted', 'success');
    } else {
      this.showToast(res.message ?? 'Failed to submit class', 'error');
    }
  }

  private showToast(msg: string, type: 'success' | 'error') {
    this.toast.set({ msg, type });
    setTimeout(() => this.toast.set(null), 4000);
  }

  // ── Calendar helpers ──
  mondayOf(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  weekDays = computed(() => {
    const mon = this.weekStart();
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name, i) => {
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
