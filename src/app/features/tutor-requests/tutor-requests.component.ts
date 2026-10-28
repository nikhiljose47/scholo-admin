import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Timestamp } from '@angular/fire/firestore';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { UsersDirectoryService } from '../../core/services/users/users-directory.service';
import { SyllabusService } from '../schedule/syllabus.service';
import { toISTDateStr, toISTTime12Str, toISTDateLabel, istPeriods } from '../schedule/schedule.service';
import { TutorRequestsService, ScheduleSessionInput } from './tutor-requests.service';
import { TutorRequest } from '../../models/tutor/tutor-request.model';
import { TutorSession, TutorSessionStatus } from '../../models/tutor/tutor-session.model';
import { UserModel } from '../../models/user/user.model';

const DURATION_OPTIONS = [15, 30, 45, 60, 90];
const TABS: { key: TutorSessionStatus; label: string }[] = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];
const PAGE_SIZE = 20;

interface SessionForm {
  studentIds: string[];
  teacherId: string;
  teacherName: string;
  meetLink: string;
  dateStr: string;
  timeStr: string;
  durationMinutes: number;
  title: string;
  message: string;
  alsoCreateLiveClass: boolean;
}

@Component({
  selector: 'app-tutor-requests',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
    <div class="page">

      <header class="page-header">
        <div>
          <h1 class="page-title">Tutor Requests &amp; Sessions</h1>
          <p class="page-subtitle">Respond to "Chat with tutor" requests and manage tutor sessions</p>
        </div>
      </header>

      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">{{ pendingRequests().length }}</div>
          <div class="stat-label">Pending requests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ scheduledToday().length }}</div>
          <div class="stat-label">Scheduled today</div>
        </div>
        <div class="stat-card">
          <div class="stat-value"><span class="live-dot"></span>{{ ongoingNow().length }}</div>
          <div class="stat-label">Ongoing now</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ completedThisWeek().length }}</div>
          <div class="stat-label">Completed this week</div>
        </div>
      </div>

      <!-- Inbox -->
      <section class="section">
        <h2 class="section-title">Inbox <span class="count-pill" *ngIf="pendingRequests().length">{{ pendingRequests().length }}</span></h2>

        <div *ngIf="loadingRequests()" class="loading-state">Loading requests…</div>

        <div *ngIf="!loadingRequests() && pendingRequests().length === 0" class="empty-state">
          <sc-icon name="bell" [size]="32" [stroke]="1"></sc-icon>
          <p class="empty-title">No pending requests</p>
        </div>

        <div class="request-list" *ngIf="pendingRequests().length > 0">
          <div *ngFor="let r of pendingRequests()" class="request-card">
            <div class="avatar">{{ initials(studentName(r.studentId)) }}</div>
            <div class="request-body">
              <div class="request-title">{{ studentName(r.studentId) }}</div>
              <div class="request-sub">{{ className(r.classId) }} · {{ chapterName(r.classId, r.chapterCode) }}</div>
              <div class="request-time">{{ timeSince(r.createdAt) }}</div>
            </div>
            <div class="request-actions">
              <button class="btn btn-primary btn-sm" (click)="openScheduleModal(r)">Schedule</button>
              <button class="btn btn-ghost btn-sm" (click)="dismiss(r)">Dismiss</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Sessions board -->
      <section class="section">
        <div class="board-header">
          <h2 class="section-title">Sessions</h2>
          <button class="btn btn-primary btn-sm" (click)="openScheduleModal()">
            <sc-icon name="plus" [size]="13" [stroke]="2.5"></sc-icon>
            New session
          </button>
        </div>
        <div class="board-toolbar">
          <div class="tabs">
            <button
              *ngFor="let t of tabs"
              class="tab-btn"
              [class.active]="activeTab() === t.key"
              (click)="activeTab.set(t.key); page.set(1)"
            >{{ t.label }} <span class="tab-count">{{ countByStatus(t.key) }}</span></button>
          </div>
          <div class="toolbar-filters">
            <div class="search-wrap">
              <sc-icon name="search" [size]="14" class="search-icon"></sc-icon>
              <input type="search" [(ngModel)]="searchText" (ngModelChange)="page.set(1)" placeholder="Search student, class, teacher…" class="search-input" />
            </div>
            <input type="date" [(ngModel)]="fromDate" (ngModelChange)="page.set(1)" class="date-input" title="From date" />
            <input type="date" [(ngModel)]="toDate" (ngModelChange)="page.set(1)" class="date-input" title="To date" />
          </div>
        </div>

        <div *ngIf="loadingSessions()" class="loading-state">Loading sessions…</div>

        <div *ngIf="!loadingSessions() && pagedSessions().length === 0" class="empty-state">
          <sc-icon name="video" [size]="32" [stroke]="1"></sc-icon>
          <p class="empty-title">No sessions here</p>
        </div>

        <div class="session-list" *ngIf="pagedSessions().length > 0">
          <div *ngFor="let s of pagedSessions()" class="session-card" [class]="s.status">
            <div class="row-state" [class]="s.status">
              <span class="pulse-dot" *ngIf="s.status === 'ongoing'"></span>
            </div>
            <div class="row-datetime">
              <div class="row-date">{{ dateLabel(s.scheduledAt) }}</div>
              <div class="row-time">{{ timeLabel(s.scheduledAt) }}</div>
            </div>
            <div class="row-body">
              <div class="row-title">{{ studentNames(s.studentIds) }}</div>
              <div class="row-sub">
                {{ s.title || 'Tutor session' }}
                <ng-container *ngIf="s.classId">· {{ className(s.classId) }}</ng-container>
                <ng-container *ngIf="s.chapterCode">· {{ chapterName(s.classId, s.chapterCode) }}</ng-container>
              </div>
              <div class="row-meta">
                <span class="meta-item"><sc-icon name="person" [size]="11" [stroke]="1.5"></sc-icon>{{ s.teacherName }}</span>
                <span class="meta-item muted">{{ s.durationMinutes }} min</span>
                <a *ngIf="s.meetLink" [href]="s.meetLink" target="_blank" class="meta-item link"><sc-icon name="video" [size]="11" [stroke]="1.5"></sc-icon>Meet link</a>
              </div>
            </div>
            <div class="row-actions">
              <span class="badge" [class]="'badge-' + s.status">{{ s.status }}</span>
              <div class="action-btns">
                <button *ngIf="s.status === 'scheduled'" class="btn btn-ghost btn-sm" (click)="setStatus(s, 'ongoing')">Start</button>
                <button *ngIf="s.status === 'ongoing'" class="btn btn-ghost btn-sm" (click)="setStatus(s, 'completed')">Complete</button>
                <button class="btn btn-ghost btn-sm" (click)="openEditModal(s)">Edit</button>
                <button *ngIf="s.status !== 'cancelled'" class="btn btn-danger btn-sm" (click)="cancel(s)">Cancel</button>
                <button class="btn btn-danger btn-sm" (click)="hardDelete(s)">Delete</button>
              </div>
            </div>
          </div>
        </div>

        <div class="pagination" *ngIf="totalPages() > 1">
          <button class="btn btn-ghost btn-sm" [disabled]="page() <= 1" (click)="page.set(page() - 1)">Prev</button>
          <span class="page-label">Page {{ page() }} of {{ totalPages() }}</span>
          <button class="btn btn-ghost btn-sm" [disabled]="page() >= totalPages()" (click)="page.set(page() + 1)">Next</button>
        </div>
      </section>

      <!-- Schedule / Edit modal -->
      <div *ngIf="modalOpen()" class="modal-backdrop" (click)="closeModal()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>{{ editingSession() ? 'Edit session' : 'Schedule session' }}</h3>
            <button class="btn btn-ghost btn-sm icon-only" (click)="closeModal()">
              <sc-icon name="x" [size]="15" [stroke]="2"></sc-icon>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-error" *ngIf="formError()">{{ formError() }}</div>

            <div class="form-row">
              <label>Date</label>
              <input type="date" [(ngModel)]="form.dateStr" class="form-input" />
            </div>
            <div class="form-row two-col">
              <div>
                <label>Time (IST)</label>
                <input type="time" [(ngModel)]="form.timeStr" class="form-input" />
              </div>
              <div>
                <label>Duration</label>
                <select [(ngModel)]="form.durationMinutes" class="form-input">
                  <option *ngFor="let d of durationOptions" [value]="d">{{ d }} min</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <label>Meet link</label>
              <input type="url" [(ngModel)]="form.meetLink" placeholder="https://meet.google.com/…" class="form-input" />
            </div>

            <div class="form-row">
              <label>Teacher</label>
              <select [(ngModel)]="form.teacherId" (ngModelChange)="onTeacherChange()" class="form-input">
                <option value="">Select teacher…</option>
                <option *ngFor="let t of teachers()" [value]="t.uid">{{ t.name }}</option>
              </select>
            </div>

            <div class="form-row">
              <label>Students</label>
              <select multiple [(ngModel)]="form.studentIds" class="form-input multiselect">
                <option *ngFor="let s of students()" [value]="s.uid">{{ s.name }}</option>
              </select>
              <p class="field-hint">Ctrl/Cmd-click to select additional students for a group session.</p>
            </div>

            <div class="form-row">
              <label>Title (optional)</label>
              <input type="text" [(ngModel)]="form.title" class="form-input" />
            </div>

            <div class="form-row">
              <label>Message (optional)</label>
              <textarea [(ngModel)]="form.message" class="form-input" rows="2"></textarea>
            </div>

            <div class="form-row checkbox-row" *ngIf="modalRequestContext()?.classId || editingSession()?.classId">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="form.alsoCreateLiveClass" />
                Also list as a bookable live-class slot on the chapter page
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeModal()">Cancel</button>
            <button class="btn btn-primary" [disabled]="saving()" (click)="submit()">
              {{ saving() ? 'Saving…' : (editingSession() ? 'Save changes' : 'Schedule session') }}
            </button>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .page { max-width: 1100px; margin: 0 auto; }
    .page-header { margin-bottom: 20px; }
    .page-title { margin: 0; font-size: 22px; font-weight: 700; color: var(--text-primary); }
    .page-subtitle { margin: 4px 0 0; color: var(--text-muted); font-size: 14px; }

    /* Stats */
    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
    .stat-card {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-lg);
      padding: 14px 16px;
      box-shadow: var(--shadow-sm);
    }
    .stat-value { display: flex; align-items: center; gap: 6px; font-size: 24px; font-weight: 700; color: var(--text-primary); }
    .stat-label { margin-top: 2px; font-size: 12px; color: var(--text-muted); }
    .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--live-dot, #e5484d); animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

    /* Sections */
    .section { margin-bottom: 28px; }
    .section-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0 0 12px; }
    .count-pill {
      background: var(--brand-subtle, var(--surface-secondary));
      color: var(--brand, var(--text-primary));
      border-radius: var(--r-full);
      font-size: 11px;
      font-weight: 700;
      padding: 1px 8px;
    }

    .loading-state, .empty-state { padding: 24px; text-align: center; color: var(--text-muted); }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .empty-title { margin: 0; font-size: 13px; }

    /* Request cards */
    .request-list { display: flex; flex-direction: column; gap: 8px; }
    .request-card {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-lg);
      padding: 12px 14px;
      box-shadow: var(--shadow-sm);
    }
    .avatar {
      width: 38px; height: 38px; border-radius: 50%;
      background: var(--brand, #5b5bd6); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 13px; flex-shrink: 0;
    }
    .request-body { flex: 1; min-width: 0; }
    .request-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
    .request-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .request-time { font-size: 11px; color: var(--text-placeholder); margin-top: 2px; }
    .request-actions { display: flex; gap: 6px; flex-shrink: 0; }

    /* Board header */
    .board-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .board-header .section-title { margin: 0; }

    /* Board toolbar */
    .board-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
    .tabs { display: flex; gap: 4px; }
    .tab-btn {
      display: flex; align-items: center; gap: 6px;
      height: 30px; padding: 0 12px;
      border-radius: var(--r-sm);
      border: 1px solid var(--border-default);
      background: var(--surface-secondary);
      color: var(--text-muted);
      font-size: 12px; font-weight: 600; cursor: pointer;
      transition: background var(--dur-base), color var(--dur-base);
    }
    .tab-btn.active { background: var(--brand-subtle, var(--surface-primary)); color: var(--text-primary); border-color: var(--border-focus, var(--border-strong)); }
    .tab-count { opacity: 0.7; }

    .toolbar-filters { display: flex; gap: 8px; flex-wrap: wrap; }
    .search-wrap { position: relative; display: flex; align-items: center; }
    .search-icon { position: absolute; left: 9px; color: var(--text-placeholder); pointer-events: none; }
    .search-input { height: 30px; width: 220px; padding: 0 10px 0 30px; background: var(--surface-primary); border: 1px solid var(--border-default); border-radius: var(--r-sm); color: var(--text-primary); font-size: 12px; outline: none; }
    .date-input { height: 30px; padding: 0 8px; background: var(--surface-primary); border: 1px solid var(--border-default); border-radius: var(--r-sm); color: var(--text-primary); font-size: 12px; outline: none; }

    /* Session cards */
    .session-list { display: flex; flex-direction: column; gap: 6px; }
    .session-card {
      display: flex; align-items: center;
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-lg);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }
    .row-state { width: 4px; align-self: stretch; flex-shrink: 0; background: var(--border-default); display: flex; align-items: center; justify-content: center; }
    .row-state.ongoing { background: var(--live-dot, #e5484d); }
    .row-state.scheduled { background: var(--up-dot, #3b82f6); }
    .row-state.completed { background: var(--past-dot, #8b8b8b); }
    .row-state.cancelled { background: var(--border-strong); }
    .pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: #fff; animation: pulse 1.4s ease-in-out infinite; }

    .row-datetime { padding: 12px 14px; min-width: 120px; flex-shrink: 0; border-right: 1px solid var(--border-subtle); }
    .row-date { font-size: 13px; font-weight: 600; color: var(--text-primary); }
    .row-time { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

    .row-body { flex: 1; padding: 10px 14px; min-width: 0; }
    .row-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
    .row-sub { font-size: 12px; color: var(--text-muted); margin: 2px 0 6px; }
    .row-meta { display: flex; flex-wrap: wrap; gap: 10px; }
    .meta-item { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-muted); }
    .meta-item.muted { color: var(--text-placeholder); }
    .meta-item.link { color: var(--brand, #5b5bd6); text-decoration: none; }
    .meta-item.link:hover { text-decoration: underline; }

    .row-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; padding: 10px 14px; flex-shrink: 0; }
    .action-btns { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .icon-only { padding: 0; width: 28px; height: 28px; }

    .badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 8px; border-radius: var(--r-full); }
    .badge-scheduled { background: var(--up-bg, #dbeafe); color: var(--up-text, #1d4ed8); }
    .badge-ongoing { background: var(--live-bg, #fee2e2); color: var(--live-text, #b91c1c); }
    .badge-completed { background: var(--past-bg, #f1f5f9); color: var(--past-text, #475569); }
    .badge-cancelled { background: var(--surface-secondary); color: var(--text-muted); }

    .pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; }
    .page-label { font-size: 12px; color: var(--text-muted); }

    /* Modal */
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
    .modal { background: var(--surface-primary); border-radius: var(--r-lg); width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; box-shadow: var(--shadow-lg, 0 10px 40px rgba(0,0,0,0.3)); }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--border-subtle); }
    .modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-primary); }
    .modal-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 18px; border-top: 1px solid var(--border-subtle); }

    .form-row label { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px; }
    .form-row.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .form-input { width: 100%; height: 34px; padding: 0 10px; background: var(--surface-secondary); border: 1px solid var(--border-default); border-radius: var(--r-sm); color: var(--text-primary); font-size: 13px; outline: none; box-sizing: border-box; }
    textarea.form-input { height: auto; padding: 8px 10px; resize: vertical; }
    select.multiselect { height: 100px; padding: 6px; }
    .field-hint { margin: 4px 0 0; font-size: 11px; color: var(--text-placeholder); }
    .checkbox-row { display: flex; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-primary); cursor: pointer; }
    .form-error { background: var(--live-bg, #fee2e2); color: var(--live-text, #b91c1c); padding: 8px 12px; border-radius: var(--r-sm); font-size: 12px; }
  `],
})
export class TutorRequestsComponent implements OnInit {
  private tutorService = inject(TutorRequestsService);
  private directory = inject(UsersDirectoryService);
  private syllabus = inject(SyllabusService);
  private destroyRef = inject(DestroyRef);
  auth = inject(AdminAuthService);

  requests = signal<TutorRequest[]>([]);
  sessions = signal<TutorSession[]>([]);
  loadingRequests = signal(true);
  loadingSessions = signal(true);

  students = signal<UserModel[]>([]);
  teachers = signal<UserModel[]>([]);
  private studentMap = computed(() => new Map(this.students().map(s => [s.uid, s])));

  private classSyllabusCache = signal<Record<string, { className: string; chapters: Record<string, string> } | null>>({});

  tabs = TABS;
  activeTab = signal<TutorSessionStatus>('scheduled');
  searchText = '';
  fromDate = '';
  toDate = '';
  page = signal(1);

  modalOpen = signal(false);
  editingSession = signal<TutorSession | null>(null);
  modalRequestContext = signal<TutorRequest | null>(null);
  saving = signal(false);
  formError = signal<string | null>(null);
  durationOptions = DURATION_OPTIONS;

  form: SessionForm = this.blankForm();

  /** Pending = not yet answered by any non-cancelled session. */
  pendingRequests = computed(() => {
    const sessions = this.sessions();
    return this.requests().filter(r => !TutorRequestsService.isHandled(r.id, sessions));
  });

  scheduledToday = computed(() => {
    const todayStr = toISTDateStr(Timestamp.now());
    return this.sessions().filter(s => s.status === 'scheduled' && toISTDateStr(s.scheduledAt) === todayStr);
  });

  ongoingNow = computed(() => this.sessions().filter(s => s.status === 'ongoing'));

  completedThisWeek = computed(() => {
    const { weekStart, weekEnd } = istPeriods();
    return this.sessions().filter(s =>
      s.status === 'completed' &&
      s.scheduledAt.toMillis() >= weekStart.toMillis() &&
      s.scheduledAt.toMillis() < weekEnd.toMillis(),
    );
  });

  filteredSessions = computed(() => {
    let list = this.sessions().filter(s => s.status === this.activeTab());

    if (this.searchText.trim()) {
      const q = this.searchText.trim().toLowerCase();
      list = list.filter(s =>
        this.studentNames(s.studentIds).toLowerCase().includes(q) ||
        s.teacherName.toLowerCase().includes(q) ||
        (s.classId ?? '').toLowerCase().includes(q) ||
        this.className(s.classId).toLowerCase().includes(q),
      );
    }

    if (this.fromDate) {
      const from = new Date(this.fromDate).getTime();
      list = list.filter(s => s.scheduledAt.toMillis() >= from);
    }
    if (this.toDate) {
      const to = new Date(this.toDate).getTime() + 24 * 60 * 60 * 1000;
      list = list.filter(s => s.scheduledAt.toMillis() < to);
    }

    return list.sort((a, b) => b.scheduledAt.toMillis() - a.scheduledAt.toMillis());
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredSessions().length / PAGE_SIZE)));

  pagedSessions = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.filteredSessions().slice(start, start + PAGE_SIZE);
  });

  countByStatus(status: TutorSessionStatus): number {
    return this.sessions().filter(s => s.status === status).length;
  }

  async ngOnInit() {
    this.tutorService.listenRequests()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        this.requests.set(data);
        this.loadingRequests.set(false);
      });

    this.tutorService.listenSessions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        this.sessions.set(data);
        this.loadingSessions.set(false);
      });

    const [studentsRes, teachersRes] = await Promise.all([
      this.directory.listStudents(),
      this.directory.listTeachers(),
    ]);
    this.students.set(studentsRes.data ?? []);
    this.teachers.set(teachersRes.data ?? []);
  }

  // ── Display helpers ──

  studentName(uid: string): string {
    return this.studentMap().get(uid)?.name ?? uid;
  }

  studentNames(uids: string[]): string {
    return uids.map(id => this.studentName(id)).join(', ') || '—';
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  className(classId?: string): string {
    if (!classId) return '';
    const cached = this.classSyllabusCache()[classId];
    if (cached === undefined) this.loadClassSyllabus(classId);
    return cached?.className ?? classId;
  }

  chapterName(classId?: string, chapterCode?: string): string {
    if (!classId || !chapterCode) return chapterCode ?? '';
    const cached = this.classSyllabusCache()[classId];
    if (cached === undefined) this.loadClassSyllabus(classId);
    return cached?.chapters[chapterCode] ?? chapterCode;
  }

  private async loadClassSyllabus(classId: string): Promise<void> {
    // Mark as "loading" immediately so repeated template reads don't refire the request.
    this.classSyllabusCache.update(map => ({ ...map, [classId]: null }));
    const syllabus = await this.syllabus.loadAnyClass(classId);
    if (!syllabus) return;
    const chapters: Record<string, string> = {};
    for (const subject of syllabus.subjects) {
      for (const chapter of subject.chapters) chapters[chapter.code] = chapter.name;
    }
    this.classSyllabusCache.update(map => ({ ...map, [classId]: { className: syllabus.className, chapters } }));
  }

  dateLabel(ts: Timestamp): string { return toISTDateLabel(ts); }
  timeLabel(ts: Timestamp): string { return toISTTime12Str(ts); }

  timeSince(ts: Timestamp): string {
    const diffMs = Date.now() - ts.toMillis();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  // ── Modal ──

  private blankForm(): SessionForm {
    return {
      studentIds: [],
      teacherId: this.auth.isAdmin() ? '' : (this.auth.uid ?? ''),
      teacherName: this.auth.isAdmin() ? '' : (this.auth.userProfile()?.name ?? ''),
      meetLink: '',
      dateStr: new Date().toISOString().slice(0, 10),
      timeStr: '',
      durationMinutes: 30,
      title: '',
      message: '',
      alsoCreateLiveClass: false,
    };
  }

  openScheduleModal(request?: TutorRequest) {
    this.editingSession.set(null);
    this.modalRequestContext.set(request ?? null);
    this.form = this.blankForm();
    if (request) this.form.studentIds = [request.studentId];
    this.formError.set(null);
    this.modalOpen.set(true);
  }

  openEditModal(session: TutorSession) {
    this.editingSession.set(session);
    this.modalRequestContext.set(null);
    this.form = {
      studentIds: [...session.studentIds],
      teacherId: session.teacherId,
      teacherName: session.teacherName,
      meetLink: session.meetLink,
      dateStr: toISTDateStr(session.scheduledAt),
      timeStr: this.to24Hour(session.scheduledAt),
      durationMinutes: session.durationMinutes,
      title: session.title ?? '',
      message: session.message ?? '',
      alsoCreateLiveClass: false,
    };
    this.formError.set(null);
    this.modalOpen.set(true);
  }

  private to24Hour(ts: Timestamp): string {
    const istMs = ts.toMillis() + 330 * 60 * 1000;
    const d = new Date(istMs);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }

  closeModal() {
    this.modalOpen.set(false);
    this.editingSession.set(null);
    this.modalRequestContext.set(null);
  }

  onTeacherChange() {
    const teacher = this.teachers().find(t => t.uid === this.form.teacherId);
    if (teacher) this.form.teacherName = teacher.name;
  }

  async submit() {
    this.formError.set(null);

    if (!this.form.dateStr || !this.form.timeStr) { this.formError.set('Pick a date and time.'); return; }
    if (!/^https?:\/\/.+/.test(this.form.meetLink)) { this.formError.set('Meet link must be a valid URL.'); return; }
    if (!this.form.teacherId) { this.formError.set('Pick a teacher.'); return; }
    if (this.form.studentIds.length === 0) { this.formError.set('Pick at least one student.'); return; }

    this.saving.set(true);

    const editing = this.editingSession();
    const requestCtx = this.modalRequestContext();

    try {
      if (editing) {
        await this.tutorService.updateSession(editing.id, {
          teacherId: this.form.teacherId,
          teacherName: this.form.teacherName,
          studentIds: this.form.studentIds,
          title: this.form.title || undefined,
          message: this.form.message || undefined,
          // Only pass as a reschedule if the value actually changed.
          meetLink: this.form.meetLink !== editing.meetLink ? this.form.meetLink : undefined,
          dateStr: this.form.dateStr !== toISTDateStr(editing.scheduledAt) ? this.form.dateStr : undefined,
          timeStr: this.form.dateStr !== toISTDateStr(editing.scheduledAt) ? this.form.timeStr : undefined,
          durationMinutes: this.form.durationMinutes !== editing.durationMinutes ? this.form.durationMinutes : undefined,
        });
      } else {
        const input: ScheduleSessionInput = {
          studentIds: this.form.studentIds,
          teacherId: this.form.teacherId,
          teacherName: this.form.teacherName,
          meetLink: this.form.meetLink,
          dateStr: this.form.dateStr,
          timeStr: this.form.timeStr,
          durationMinutes: Number(this.form.durationMinutes),
          classId: requestCtx?.classId,
          chapterCode: requestCtx?.chapterCode,
          title: this.form.title || undefined,
          message: this.form.message || undefined,
          requestIds: requestCtx ? [requestCtx.id] : undefined,
          alsoCreateLiveClass: this.form.alsoCreateLiveClass,
        };
        const res = await this.tutorService.scheduleSession(input);
        if (!res.ok) { this.formError.set(res.message ?? 'Failed to schedule session.'); this.saving.set(false); return; }
      }
      this.saving.set(false);
      this.closeModal();
    } catch (e: unknown) {
      this.formError.set((e as Error).message ?? 'Something went wrong.');
      this.saving.set(false);
    }
  }

  // ── Row actions ──

  async dismiss(request: TutorRequest) {
    if (!confirm(`Dismiss ${this.studentName(request.studentId)}'s request without scheduling?`)) return;
    await this.tutorService.dismissRequest(request);
  }

  async setStatus(session: TutorSession, status: TutorSessionStatus) {
    await this.tutorService.updateSession(session.id, { status });
  }

  async cancel(session: TutorSession) {
    if (!confirm(`Cancel this session with ${this.studentNames(session.studentIds)}?`)) return;
    await this.tutorService.cancelSession(session.id);
  }

  async hardDelete(session: TutorSession) {
    if (!confirm('Permanently delete this session? This cannot be undone.')) return;
    await this.tutorService.deleteSession(session.id);
  }
}
