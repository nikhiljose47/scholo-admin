import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SyllabusService } from '../schedule/syllabus.service';
import { ProvidersService } from '../providers/providers.service';
import { ClassProgressService } from './class-progress.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { Chapter } from '../../models/syllabus/syllabus.model';

/** One syllabus class taught at one tuition center — the unit progress is tracked for. */
interface ProgressCard {
  key: string;
  classId: string;
  centerId: string;
  centerName: string;
  className: string;
  chapters: Chapter[];
  curCode: string | null;
  saving: boolean;
  open: boolean;
}

@Component({
  selector: 'app-class-progress',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Class Progress</h1>
          <p>Set the current chapter for each syllabus at your tuition centers.</p>
        </div>
      </header>

      <div class="notice" *ngIf="!canEdit()">
        🔒 You can view progress, but updating it needs the "can edit content" permission. Ask an admin to enable it for your account.
      </div>
      <div class="notice error" *ngIf="toast() as t">{{ t }}</div>

      <div class="summary" *ngIf="!loading() && cards().length">
        <div class="chip"><strong>{{ centers().length }}</strong> {{ centers().length === 1 ? 'center' : 'centers' }}</div>
        <div class="chip"><strong>{{ cards().length }}</strong> classes</div>
        <div class="chip"><strong>{{ averagePct() }}%</strong> average progress</div>
      </div>

      <div class="filter" *ngIf="centers().length > 1">
        <button class="pill" [class.on]="!centerFilter()" (click)="centerFilter.set('')">All centers</button>
        <button class="pill" *ngFor="let c of centers()" [class.on]="centerFilter() === c" (click)="centerFilter.set(c)">🏫 {{ c }}</button>
      </div>

      <div *ngIf="loading()" class="loading">Loading…</div>

      <div *ngIf="!loading() && !cards().length" class="empty">
        <span>🎯</span>
        <p>{{ emptyMessage() }}</p>
      </div>

      <div class="grid">
        <article class="card" *ngFor="let g of visibleCards()">
          <header class="card-head">
            <div>
              <div class="center">🏫 {{ g.centerName }}</div>
              <h2>{{ g.className }}</h2>
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
            <p class="muted">The syllabus for this class isn't available yet, so chapters can't be tracked.</p>
          </ng-template>
        </article>
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 1100px; margin: 0 auto; }
    .page-header { margin-bottom: 20px; }
    h1 { margin: 0; font-size: 22px; font-weight: 700; color: #1e293b; }
    .page-header p { margin: 4px 0 0; color: #64748b; font-size: 14px; }
    .btn-primary { background: #3b82f6; color: #fff; border: none; padding: 9px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; text-align: left; }
    .btn-primary:disabled { background: #cbd5e1; cursor: not-allowed; }
    .notice { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 14px; }
    .notice.error { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }
    .summary { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
    .chip { background: #fff; padding: 8px 14px; border-radius: 20px; font-size: 13px; color: #475569; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
    .chip strong { color: #1e293b; font-size: 15px; }
    .filter { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .pill { background: #fff; border: 1px solid #cbd5e1; border-radius: 20px; padding: 6px 14px; font-size: 13px; cursor: pointer; color: #475569; }
    .pill.on { background: #3b82f6; border-color: #3b82f6; color: #fff; }
    .loading, .muted { color: #64748b; font-size: 13px; }
    .empty { text-align: center; padding: 60px 20px; color: #64748b; }
    .empty span { font-size: 48px; display: block; margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; align-items: start; }
    .card { background: #fff; border-radius: 12px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
    .card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .center { font-size: 12px; font-weight: 600; color: #7c3aed; margin-bottom: 2px; }
    h2 { margin: 0; font-size: 17px; color: #1e293b; }
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
  `],
})
export class ClassProgressComponent implements OnInit {
  auth = inject(AdminAuthService);
  private providers = inject(ProvidersService);
  private syllabus = inject(SyllabusService);
  private progress = inject(ClassProgressService);

  loading = signal(true);
  cards = signal<ProgressCard[]>([]);
  toast = signal('');
  centerFilter = signal('');

  centers = computed(() => [...new Set(this.cards().map(c => c.centerName))].sort());
  visibleCards = computed(() => this.cards().filter(c => !this.centerFilter() || c.centerName === this.centerFilter()));

  /** Admins always; teachers only once an admin has granted canEditContent. */
  canEdit = computed(() => this.auth.isAdmin() || this.auth.userProfile()?.canEditContent === true);

  averagePct = computed(() => {
    const cs = this.cards().filter(c => c.chapters.length);
    return cs.length ? Math.round(cs.reduce((n, c) => n + this.pct(c), 0) / cs.length) : 0;
  });

  private assignedCenters = signal(true);
  emptyMessage = computed(() =>
    this.assignedCenters()
      ? 'No classes are linked to your tuition centers yet. An admin can link them on the Classes page.'
      : 'No tuition center is assigned to your account yet. Ask an admin to assign one.',
  );

  async ngOnInit() {
    const [prov, cls] = await Promise.all([this.providers.listProviders(), this.providers.listClasses()]);
    const names = new Map((prov.data ?? []).map(p => [p.id, p.name || p.id]));

    // Admins work across every center; teachers only their own (assigned by an admin on their profile).
    const centerIds = this.auth.isAdmin()
      ? new Set(names.keys())
      : new Set(this.auth.userProfile()?.tuitionCenterIds ?? []);
    this.assignedCenters.set(centerIds.size > 0);

    const linked = (cls.data ?? []).filter(c => c.providerId && centerIds.has(c.providerId));
    const cards = await Promise.all(linked.map(async (c): Promise<ProgressCard> => {
      const centerId = c.providerId!;
      const [syl, curCode] = await Promise.all([
        this.syllabus.loadClass(c.id).catch(() => null),
        this.progress.getCurrentChapter(c.id, centerId).catch(() => null),
      ]);
      return {
        key: `${c.id}|${centerId}`,
        classId: c.id,
        centerId,
        centerName: names.get(centerId) ?? centerId,
        className: syl?.className ?? c.name ?? c.className ?? c.title ?? c.id,
        chapters: (syl?.subjects ?? []).flatMap(s => s.chapters).filter(ch => ch.enabled !== false),
        curCode,
        saving: false,
        open: false,
      };
    }));
    this.cards.set(cards.sort((a, b) => a.centerName.localeCompare(b.centerName) || a.className.localeCompare(b.className)));
    this.loading.set(false);
  }

  currentIdx(g: ProgressCard): number {
    return g.curCode ? g.chapters.findIndex(c => c.code === g.curCode) : -1;
  }
  doneCount(g: ProgressCard): number { return Math.max(this.currentIdx(g), 0); }
  pct(g: ProgressCard): number {
    return g.chapters.length ? Math.round((this.doneCount(g) / g.chapters.length) * 100) : 0;
  }
  status(g: ProgressCard, i: number): 'done' | 'current' | 'todo' {
    const cur = this.currentIdx(g);
    return i < cur ? 'done' : i === cur ? 'current' : 'todo';
  }

  toggle(g: ProgressCard) { this.patch(g.key, { open: !g.open }); }

  pick(g: ProgressCard, i: number) {
    const target = g.chapters[i];
    if (target.code === g.curCode) return;
    if (i < this.currentIdx(g) && !confirm(`Move back to "${target.name}"? Later chapters will show as not done.`)) return;
    this.setChapter(g, target.code);
  }

  async setChapter(g: ProgressCard, code: string) {
    const previous = g.curCode;
    this.toast.set('');
    this.patch(g.key, { curCode: code, saving: true }); // optimistic
    const res = await this.progress.setCurrentChapter(g.classId, g.centerId, code);
    if (!res.ok) {
      this.patch(g.key, { curCode: previous });
      this.toast.set(`Couldn't save progress: ${res.message ?? 'permission denied'}`);
    }
    this.patch(g.key, { saving: false });
  }

  private patch(key: string, change: Partial<ProgressCard>) {
    this.cards.update(cs => cs.map(c => (c.key === key ? { ...c, ...change } : c)));
  }
}
