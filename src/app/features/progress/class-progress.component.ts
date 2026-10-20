import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ScheduleService, toISTDateStr, toISTTimeStr } from '../schedule/schedule.service';
import { SyllabusService } from '../schedule/syllabus.service';
import { ClassProgressService } from './class-progress.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { Meeting } from '../../models/schedule/meeting.model';
import { Chapter } from '../../models/syllabus/syllabus.model';

const HISTORY_DAYS = 120;

interface ClassGroup {
  key: string;
  classId: string;
  batchId: string;
  providerId: string | null;
  centerName: string;
  className: string;
  subjectName: string;
  chapters: Chapter[];
  curCode: string | null;
  upcoming: Meeting[];
  lastTaught: Meeting | null;
  saving: boolean;
  open: boolean;
}

@Component({
  selector: 'app-class-progress',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Class Progress</h1>
          <p>{{ auth.isAdmin() ? 'Every class being taught' : 'The classes you conduct — keep each one on track' }}</p>
        </div>
        <a routerLink="/schedule/new" class="btn-primary">+ Schedule Class</a>
      </header>

      <div class="notice" *ngIf="!canEdit()">
        🔒 You can view progress, but updating it needs the "can edit content" permission. Ask an admin to enable it for your account.
      </div>
      <div class="notice error" *ngIf="toast() as t">{{ t }}</div>

      <div class="summary" *ngIf="!loading() && groups().length">
        <div class="chip"><strong>{{ groups().length }}</strong> classes</div>
        <div class="chip"><strong>{{ averagePct() }}%</strong> average progress</div>
        <div class="chip"><strong>{{ upcomingTotal() }}</strong> upcoming sessions</div>
      </div>

      <div class="filter" *ngIf="centers().length > 1">
        <button class="pill" [class.on]="!centerFilter()" (click)="centerFilter.set('')">All centers</button>
        <button class="pill" *ngFor="let c of centers()" [class.on]="centerFilter() === c" (click)="centerFilter.set(c)">🏫 {{ c }}</button>
      </div>

      <div *ngIf="loading()" class="loading">Loading your classes…</div>

      <div *ngIf="!loading() && groups().length === 0" class="empty">
        <span>🎯</span>
        <p>No classes yet. Schedule a session and the class will show up here.</p>
        <a routerLink="/schedule/new" class="btn-primary">Schedule a class</a>
      </div>

      <div class="grid">
        <article class="card" *ngFor="let g of visibleGroups()">
          <header class="card-head">
            <div>
              <div class="center">🏫 {{ g.centerName }}</div>
              <h2>{{ g.className }}</h2>
              <div class="subject">{{ g.subjectName }}<span *ngIf="g.batchId !== 'default'"> · Batch {{ g.batchId }}</span></div>
            </div>
            <div class="pct">{{ pct(g) }}<small>%</small></div>
          </header>

          <ng-container *ngIf="g.chapters.length; else noSyllabus">
            <div class="bar"><div class="fill" [style.width.%]="pct(g)"></div></div>
            <div class="bar-label">{{ doneCount(g) }} of {{ g.chapters.length }} chapters done</div>

            <div class="current">
              <div class="current-label">{{ currentIdx(g) >= 0 ? 'Now teaching' : 'Not started' }}</div>
              <div class="current-name">
                {{ currentIdx(g) >= 0 ? g.chapters[currentIdx(g)].name : g.chapters[0].name }}
              </div>
              <div class="actions">
                <button class="btn-primary" *ngIf="currentIdx(g) < 0" [disabled]="!canEdit() || g.saving"
                        (click)="setChapter(g, g.chapters[0].code)">▶ Start first chapter</button>
                <button class="btn-primary" *ngIf="currentIdx(g) >= 0 && currentIdx(g) < g.chapters.length - 1"
                        [disabled]="!canEdit() || g.saving" (click)="setChapter(g, g.chapters[currentIdx(g) + 1].code)">
                  ✓ Done — next: {{ g.chapters[currentIdx(g) + 1].name }}
                </button>
                <span class="final" *ngIf="currentIdx(g) === g.chapters.length - 1">🏁 Final chapter</span>
                <button class="btn-ghost" *ngIf="suggestion(g) as s" [disabled]="!canEdit() || g.saving"
                        (click)="setChapter(g, s.chapterCode)">
                  ↻ Sync to last taught: {{ s.chapterName }}
                </button>
              </div>
            </div>

            <button class="toggle" (click)="toggle(g)">{{ g.open ? 'Hide' : 'Show' }} all chapters</button>
            <ol class="stepper" *ngIf="g.open">
              <li *ngFor="let ch of g.chapters; let i = index" [class]="status(g, i)"
                  (click)="canEdit() && !g.saving && pick(g, i)" [class.clickable]="canEdit()">
                <span class="dot">{{ status(g, i) === 'done' ? '✓' : i + 1 }}</span>
                <span class="ch-name">{{ ch.name }}</span>
                <span class="tag" *ngIf="status(g, i) === 'current'">current</span>
              </li>
            </ol>
          </ng-container>
          <ng-template #noSyllabus>
            <p class="muted">The syllabus for this class isn't available, so chapters can't be tracked yet.</p>
          </ng-template>

          <div class="sessions">
            <div class="sessions-title">Upcoming</div>
            <div *ngFor="let m of g.upcoming" class="session">
              📅 {{ istDate(m) }} · {{ istTime(m) }} <span class="muted">— {{ m.chapterName || m.chapterCode }}</span>
            </div>
            <div *ngIf="!g.upcoming.length" class="muted">No upcoming sessions.</div>
            <div class="last" *ngIf="g.lastTaught as l">Last taught: {{ l.chapterName || l.chapterCode }} · {{ istDate(l) }}</div>
          </div>
        </article>
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 1100px; margin: 0 auto; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
    h1 { margin: 0; font-size: 22px; font-weight: 700; color: #1e293b; }
    .page-header p { margin: 4px 0 0; color: #64748b; font-size: 14px; }
    .btn-primary { background: #3b82f6; color: #fff; border: none; padding: 9px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; text-align: left; }
    .btn-primary:disabled { background: #cbd5e1; cursor: not-allowed; }
    .btn-ghost { background: #fff; color: #334155; border: 1px solid #cbd5e1; padding: 8px 12px; border-radius: 8px; font-size: 13px; cursor: pointer; text-align: left; }
    .btn-ghost:disabled { color: #94a3b8; cursor: not-allowed; }
    .notice { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 14px; }
    .notice.error { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }
    .filter { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .pill { background: #fff; border: 1px solid #cbd5e1; border-radius: 20px; padding: 6px 14px; font-size: 13px; cursor: pointer; color: #475569; }
    .pill.on { background: #3b82f6; border-color: #3b82f6; color: #fff; }
    .center { font-size: 12px; font-weight: 600; color: #7c3aed; margin-bottom: 2px; }
    .summary { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
    .chip { background: #fff; padding: 8px 14px; border-radius: 20px; font-size: 13px; color: #475569; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
    .chip strong { color: #1e293b; font-size: 15px; }
    .loading, .muted { color: #64748b; font-size: 13px; }
    .empty { text-align: center; padding: 60px 20px; color: #64748b; }
    .empty span { font-size: 48px; display: block; margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; align-items: start; }
    .card { background: #fff; border-radius: 12px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
    .card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    h2 { margin: 0; font-size: 17px; color: #1e293b; }
    .subject { color: #64748b; font-size: 13px; margin-top: 2px; }
    .pct { font-size: 28px; font-weight: 700; color: #3b82f6; line-height: 1; }
    .pct small { font-size: 14px; }
    .bar { height: 8px; background: #e2e8f0; border-radius: 6px; margin-top: 12px; overflow: hidden; }
    .fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #22c55e); border-radius: 6px; transition: width .3s; }
    .bar-label { font-size: 12px; color: #64748b; margin-top: 4px; }
    .current { background: #eff6ff; border-radius: 10px; padding: 12px; margin-top: 14px; }
    .current-label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #3b82f6; font-weight: 700; }
    .current-name { font-size: 16px; font-weight: 600; color: #1e293b; margin: 2px 0 10px; }
    .actions { display: flex; flex-direction: column; gap: 8px; }
    .final { color: #15803d; font-weight: 600; font-size: 14px; }
    .toggle { background: none; border: none; color: #3b82f6; cursor: pointer; font-size: 13px; padding: 10px 0 4px; }
    .stepper { list-style: none; margin: 0; padding: 0; max-height: 280px; overflow-y: auto; }
    .stepper li { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; font-size: 13px; color: #64748b; }
    .stepper li.clickable { cursor: pointer; }
    .stepper li.clickable:hover { background: #f1f5f9; }
    .dot { width: 24px; height: 24px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    li.done { color: #15803d; }
    li.done .dot { background: #22c55e; color: #fff; }
    li.current { color: #1e293b; font-weight: 600; background: #eff6ff; }
    li.current .dot { background: #3b82f6; color: #fff; }
    .ch-name { flex: 1; }
    .tag { background: #3b82f6; color: #fff; font-size: 10px; padding: 2px 8px; border-radius: 10px; }
    .sessions { border-top: 1px solid #e2e8f0; margin-top: 14px; padding-top: 12px; font-size: 13px; color: #334155; }
    .sessions-title { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; font-weight: 700; margin-bottom: 4px; }
    .session { margin: 3px 0; }
    .last { margin-top: 8px; color: #64748b; font-size: 12px; }
  `],
})
export class ClassProgressComponent implements OnInit {
  auth = inject(AdminAuthService);
  private schedule = inject(ScheduleService);
  private syllabus = inject(SyllabusService);
  private progress = inject(ClassProgressService);

  loading = signal(true);
  groups = signal<ClassGroup[]>([]);
  toast = signal('');
  centerFilter = signal('');
  centers = computed(() => [...new Set(this.groups().map(g => g.centerName))].sort());
  visibleGroups = computed(() => this.groups().filter(g => !this.centerFilter() || g.centerName === this.centerFilter()));

  /** Admins always; teachers only once an admin has granted canEditContent. */
  canEdit = computed(() => this.auth.isAdmin() || this.auth.userProfile()?.canEditContent === true);

  averagePct = computed(() => {
    const gs = this.groups().filter(g => g.chapters.length);
    return gs.length ? Math.round(gs.reduce((n, g) => n + this.pct(g), 0) / gs.length) : 0;
  });
  upcomingTotal = computed(() => this.groups().reduce((n, g) => n + g.upcoming.length, 0));

  async ngOnInit() {
    const res = await this.schedule.listForCurrentUser(HISTORY_DAYS, 300);
    const meetings = res.data ?? [];
    const now = Date.now();

    // One card per class+batch; meetings arrive newest-first.
    const byKey = new Map<string, Meeting[]>();
    for (const m of meetings) {
      const key = `${m.classId}|${m.batchId || 'default'}`;
      byKey.set(key, [...(byKey.get(key) ?? []), m]);
    }

    const providers = new Map((await this.progress.listProviders().catch(() => [])).map(p => [p.id, p.name || p.id]));

    const groups = await Promise.all([...byKey.entries()].map(async ([key, ms]): Promise<ClassGroup> => {
      const newest = ms[0];
      const batchId = newest.batchId || 'default';
      const [classSyllabus, curCode, providerId] = await Promise.all([
        this.syllabus.loadClass(newest.classId).catch(() => null),
        this.progress.getCurrentChapter(newest.classId, batchId).catch(() => null),
        this.progress.getClassProviderId(newest.classId).catch(() => null),
      ]);
      const subject = classSyllabus?.subjects.find(s => s.code === newest.subjectId) ?? classSyllabus?.subjects[0];
      return {
        key,
        classId: newest.classId,
        batchId,
        providerId,
        centerName: (providerId && providers.get(providerId)) || 'Unassigned center',
        className: newest.className ?? classSyllabus?.className ?? newest.classId,
        subjectName: newest.subjectName ?? subject?.name ?? '',
        chapters: (subject?.chapters ?? []).filter(c => c.enabled !== false),
        curCode,
        upcoming: ms.filter(m => m.date.toMillis() > now && m.endAt.toMillis() > now)
          .sort((a, b) => a.date.toMillis() - b.date.toMillis()).slice(0, 3),
        lastTaught: ms.find(m => m.endAt.toMillis() < now && m.date.toMillis() < now) ?? null,
        saving: false,
        open: false,
      };
    }));
    this.groups.set(groups.sort((a, b) => a.className.localeCompare(b.className)));
    this.loading.set(false);
  }

  currentIdx(g: ClassGroup): number {
    return g.curCode ? g.chapters.findIndex(c => c.code === g.curCode) : -1;
  }
  doneCount(g: ClassGroup): number { return Math.max(this.currentIdx(g), 0); }
  pct(g: ClassGroup): number {
    return g.chapters.length ? Math.round((this.doneCount(g) / g.chapters.length) * 100) : 0;
  }
  status(g: ClassGroup, i: number): 'done' | 'current' | 'todo' {
    const cur = this.currentIdx(g);
    return i < cur ? 'done' : i === cur ? 'current' : 'todo';
  }

  /** Offer to jump to the chapter of the last session actually held, when it differs from the tracked one. */
  suggestion(g: ClassGroup): { chapterCode: string; chapterName: string } | null {
    const code = g.lastTaught?.chapterCode;
    if (!code || code === g.curCode) return null;
    const ch = g.chapters.find(c => c.code === code);
    return ch ? { chapterCode: ch.code, chapterName: ch.name } : null;
  }

  toggle(g: ClassGroup) { this.patch(g.key, { open: !g.open }); }

  pick(g: ClassGroup, i: number) {
    const target = g.chapters[i];
    if (target.code === g.curCode) return;
    if (i < this.currentIdx(g) && !confirm(`Move back to "${target.name}"? Later chapters will show as not done.`)) return;
    this.setChapter(g, target.code);
  }

  async setChapter(g: ClassGroup, code: string) {
    const previous = g.curCode;
    this.toast.set('');
    this.patch(g.key, { curCode: code, saving: true }); // optimistic
    const res = await this.progress.setCurrentChapter(g.classId, g.batchId, code, g.providerId);
    if (!res.ok) {
      this.patch(g.key, { curCode: previous });
      this.toast.set(`Couldn't save progress: ${res.message ?? 'permission denied'}`);
    }
    this.patch(g.key, { saving: false });
  }

  istDate(m: Meeting) { return toISTDateStr(m.date); }
  istTime(m: Meeting) { return toISTTimeStr(m.date); }

  private patch(key: string, change: Partial<ClassGroup>) {
    this.groups.update(gs => gs.map(g => (g.key === key ? { ...g, ...change } : g)));
  }
}
