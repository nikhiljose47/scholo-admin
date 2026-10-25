import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SyllabusService } from '../schedule/syllabus.service';
import { ProvidersService } from '../providers/providers.service';
import { ClassProgressService } from './class-progress.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { Chapter } from '../../models/syllabus/syllabus.model';

interface ProgressCard {
  key: string;
  docId: string;
  classId: string;
  centerId: string;
  centerName: string;
  className: string;
  chapters: Chapter[];
  curCode: string | null;
  saving: boolean;
  saved: boolean;
}

@Component({
  selector: 'app-class-progress',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <h1 class="page-title">Class Progress</h1>
        <p class="page-subtitle">Select a class below to view and update its chapter progress.</p>
      </header>

      <div class="notice warn" *ngIf="!canEdit()">
        🔒 You can view progress but cannot update it. Ask an admin to enable the "can edit content" permission.
      </div>
      <div class="notice error" *ngIf="toast()">⚠ {{ toast() }}</div>

      <div *ngIf="loading()" class="loading">Loading your classes…</div>

      <div *ngIf="!loading() && !cards().length" class="empty">
        <span>🎯</span>
        <p>{{ emptyMessage() }}</p>
      </div>

      <!-- Class picker cards -->
      <ng-container *ngIf="!loading() && cards().length">
        <ng-container *ngFor="let group of cardsByCenter()">
          <div class="center-label">🏫 {{ group.centerName }}</div>
          <div class="cards-scroll-wrap">
            <div class="cards-row" #row>
            <button
              class="class-card"
              *ngFor="let g of group.cards"
              [class.selected]="selected()?.key === g.key"
              (click)="selectCard(g)">

              <div class="class-card-ring">
                <svg viewBox="0 0 40 40" width="44" height="44">
                  <circle cx="20" cy="20" r="16" fill="none" stroke="var(--ring-bg)" stroke-width="4"/>
                  <circle cx="20" cy="20" r="16" fill="none" stroke="var(--ring-fg)" stroke-width="4"
                    [attr.stroke-dasharray]="circumference"
                    [attr.stroke-dashoffset]="circumference - (pct(g) / 100) * circumference"
                    stroke-linecap="round" transform="rotate(-90 20 20)"/>
                </svg>
                <span class="ring-pct">{{ pct(g) }}%</span>
              </div>

              <div class="class-card-info">
                <div class="class-card-name">{{ g.className }}</div>
                <div class="class-card-status" *ngIf="g.chapters.length">
                  {{ doneCount(g) }}/{{ g.chapters.length }} chapters
                </div>
                <div class="class-card-status warn-text" *ngIf="!g.chapters.length">
                  No syllabus linked
                </div>
              </div>

              <div class="class-card-arrow">›</div>
            </button>
            </div>
            <button class="scroll-btn" (click)="scrollRow(row)">›</button>
          </div>
        </ng-container>

        <!-- Chapter detail panel (appears below when a class is selected) -->
        <div class="detail-panel" *ngIf="selected() as g">

          <div class="detail-header">
            <div class="detail-title-row">
              <div>
                <div class="detail-class-name">{{ g.className }}</div>
                <div class="detail-center-name">{{ g.centerName }}</div>
              </div>
              <button class="close-btn" (click)="selectCard(null)" title="Close">✕</button>
            </div>

            <!-- Progress bar -->
            <div class="detail-progress-row" *ngIf="g.chapters.length">
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="pct(g)"></div>
              </div>
              <span class="progress-label">{{ doneCount(g) }} of {{ g.chapters.length }} chapters done</span>
            </div>

            <!-- Main action button -->
            <ng-container *ngIf="g.chapters.length && canEdit()">
              <!-- Not started -->
              <button class="btn-action btn-start" *ngIf="currentIdx(g) < 0"
                      [disabled]="g.saving"
                      (click)="confirmAndSetNext(g, g.chapters[0].code, g.chapters[0].name, 1)">
                {{ g.saving ? 'Saving…' : '▶ Start — Chapter 1: ' + g.chapters[0].name }}
              </button>

              <!-- In progress -->
              <ng-container *ngIf="currentIdx(g) >= 0 && currentIdx(g) < g.chapters.length - 1">
                <button class="btn-action btn-next" [disabled]="g.saving"
                        (click)="confirmAndSetNext(g, g.chapters[currentIdx(g)+1].code, g.chapters[currentIdx(g)+1].name, currentIdx(g)+2)">
                  <span *ngIf="!g.saving">
                    ✓ Chapter {{ currentIdx(g)+1 }} done — move to Chapter {{ currentIdx(g)+2 }}
                    <small>{{ g.chapters[currentIdx(g)+1].name }}</small>
                  </span>
                  <span *ngIf="g.saving">Saving…</span>
                </button>
              </ng-container>

              <!-- All done -->
              <div class="final-badge" *ngIf="currentIdx(g) === g.chapters.length - 1">
                🏁 All {{ g.chapters.length }} chapters completed!
              </div>
            </ng-container>

            <div class="saved-toast" *ngIf="g.saved">✅ Progress saved!</div>
          </div>

          <!-- Chapters list -->
          <ng-container *ngIf="g.chapters.length; else noSyllabus">
            <div class="chapters-heading">All chapters</div>
            <ol class="chapter-list">
              <li *ngFor="let ch of g.chapters; let i = index"
                  [class]="'ch-row ' + status(g, i)">

                <div class="ch-dot">
                  <span *ngIf="status(g, i) === 'done'">✓</span>
                  <span *ngIf="status(g, i) !== 'done'">{{ i + 1 }}</span>
                </div>

                <div class="ch-body">
                  <div class="ch-name">{{ ch.name }}</div>
                  <div class="ch-badge" *ngIf="status(g, i) === 'current'">Current chapter</div>
                </div>

                <button class="btn-set"
                        *ngIf="canEdit() && status(g, i) !== 'current'"
                        [disabled]="g.saving"
                        (click)="pick(g, i)">
                  Set
                </button>
              </li>
            </ol>
          </ng-container>

          <ng-template #noSyllabus>
            <p class="no-syllabus">No syllabus linked yet. An admin can fix this on the Classes page.</p>
          </ng-template>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    :host {
      --ring-bg: var(--border-default);
      --ring-fg: var(--success-color);
    }

    .page { max-width: 860px; margin: 0 auto; padding-bottom: 48px; }

    .notice { padding: 12px 16px; border-radius: var(--r-lg); font-size: 14px; margin-bottom: 16px; }
    .notice.warn  { background: var(--warning-bg); border: 1px solid color-mix(in srgb, var(--warning-color) 30%, transparent); color: var(--warning-text); }
    .notice.error { background: var(--danger-bg); border: 1px solid color-mix(in srgb, var(--danger-color) 25%, transparent); color: var(--danger-text); }

    .loading { color: var(--text-muted); font-size: 15px; padding: 48px 0; text-align: center; }
    .empty { text-align: center; padding: 64px 20px; color: var(--text-muted); }
    .empty span { font-size: 48px; display: block; margin-bottom: 12px; }
    .empty p { font-size: 15px; margin: 0; }

    /* Center label */
    .center-label {
      font-size: 13px;
      font-weight: 700;
      color: #7c3aed;
      margin: 24px 0 10px;
      letter-spacing: 0.02em;
    }

    /* Class picker cards */
    .cards-scroll-wrap {
      position: relative;
      display: flex;
      align-items: stretch;
      margin-bottom: 4px;
    }

    .cards-row {
      display: flex;
      flex-wrap: nowrap;
      gap: 12px;
      overflow-x: auto;
      scroll-behavior: smooth;
      scrollbar-width: none;
      flex: 1;
      min-width: 0;
    }

    .cards-row::-webkit-scrollbar { display: none; }

    .scroll-btn {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 56px;
      border: none;
      background: linear-gradient(to right, transparent, var(--surface-app) 40%, var(--surface-app) 95%);
      color: var(--text-secondary);
      font-size: 28px;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 6px;
      border-radius: 0 var(--r-xl) var(--r-xl) 0;
      transition: color 0.15s;
      z-index: 1;
    }

    .scroll-btn:hover { color: var(--text-primary); }

    .class-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: var(--surface-primary);
      border: 2px solid var(--border-subtle);
      border-radius: var(--r-xl);
      cursor: pointer;
      text-align: left;
      transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
      width: 220px;
      min-width: 220px;
      flex-shrink: 0;
      height: 72px;
      box-sizing: border-box;
    }

    .class-card:hover {
      border-color: var(--brand);
      box-shadow: 0 0 0 3px var(--border-focus-ring);
    }

    .class-card.selected {
      border-color: var(--brand);
      background: var(--brand-subtle);
      box-shadow: 0 0 0 3px var(--border-focus-ring);
    }

    .class-card-ring { position: relative; width: 44px; height: 44px; flex-shrink: 0; }
    .ring-pct {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; color: var(--success-text);
    }

    .class-card-info { flex: 1; min-width: 0; overflow: hidden; }
    .class-card-name {
      font-size: 13px; font-weight: 700; color: var(--text-primary); line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .class-card-status { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .warn-text { color: var(--warning-text); }

    .class-card-arrow { font-size: 22px; color: var(--border-strong); line-height: 1; }
    .class-card.selected .class-card-arrow { color: var(--brand); }

    /* Detail panel */
    .detail-panel {
      margin-top: 24px;
      background: var(--surface-primary);
      border-radius: var(--r-2xl);
      border: 1px solid var(--border-subtle);
      box-shadow: var(--shadow-md);
      overflow: hidden;
      animation: panel-in 0.18s ease-out;
    }

    @keyframes panel-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .detail-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .detail-title-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .detail-class-name { font-size: 20px; font-weight: 700; color: var(--text-primary); line-height: 1.3; }
    .detail-center-name { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

    .close-btn {
      background: none; border: none; cursor: pointer;
      font-size: 18px; color: var(--text-placeholder); padding: 4px 8px;
      border-radius: var(--r-sm); line-height: 1;
      transition: background 0.1s, color 0.1s;
    }
    .close-btn:hover { background: var(--surface-hover); color: var(--text-secondary); }

    /* Progress bar */
    .detail-progress-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .progress-bar {
      flex: 1;
      height: 8px;
      background: var(--border-default);
      border-radius: var(--r-sm);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #22c55e);
      border-radius: var(--r-sm);
      transition: width 0.4s;
    }

    .progress-label { font-size: 12px; color: var(--text-muted); white-space: nowrap; }

    /* Action buttons */
    .btn-action {
      width: 100%;
      padding: 14px 20px;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      text-align: left;
      line-height: 1.5;
      display: flex;
      flex-direction: column;
      gap: 2px;
      transition: filter 0.1s;
    }

    .btn-action:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn-action:not(:disabled):hover { filter: brightness(1.05); }

    .btn-start { background: #3b82f6; color: #fff; }
    .btn-next  { background: #16a34a; color: #fff; }

    .btn-action small {
      font-size: 12px;
      font-weight: 400;
      opacity: 0.88;
    }

    .final-badge {
      text-align: center;
      font-size: 15px;
      font-weight: 700;
      color: var(--success-text);
      padding: 12px;
      background: var(--success-bg);
      border-radius: var(--r-lg);
    }

    .saved-toast {
      text-align: center;
      font-size: 14px;
      font-weight: 700;
      color: var(--success-text);
      animation: fade-in 0.2s ease;
    }

    @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }

    /* Chapter list */
    .chapters-heading {
      padding: 16px 24px 8px;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-placeholder);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .chapter-list {
      list-style: none;
      margin: 0;
      padding: 0 0 8px;
    }

    .ch-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 11px 24px;
      border-bottom: 1px solid var(--border-subtle);
      transition: background 0.1s;
    }

    .ch-row:last-child { border-bottom: none; }
    .ch-row.done  { opacity: 0.65; }
    .ch-row.current { background: var(--success-bg); }

    .ch-dot {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
      background: var(--border-default);
      color: var(--text-muted);
    }

    .ch-row.done    .ch-dot { background: var(--success-color); color: #fff; }
    .ch-row.current .ch-dot { background: var(--brand); color: #fff; }

    .ch-body { flex: 1; min-width: 0; }
    .ch-name { font-size: 14px; color: var(--text-primary); line-height: 1.4; }
    .ch-row.done .ch-name { color: var(--text-muted); }

    .ch-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      color: var(--brand-text);
      background: var(--brand-subtle);
      border-radius: var(--r-full);
      padding: 1px 8px;
      margin-top: 2px;
      letter-spacing: 0.02em;
    }

    .btn-set {
      padding: 5px 14px;
      background: none;
      border: 1.5px solid var(--border-strong);
      border-radius: var(--r-full);
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      cursor: pointer;
      white-space: nowrap;
      transition: border-color 0.12s, color 0.12s, background 0.12s;
    }

    .btn-set:not(:disabled):hover {
      border-color: var(--brand);
      color: var(--brand-text);
      background: var(--brand-subtle);
    }

    .btn-set:disabled { opacity: 0.4; cursor: not-allowed; }

    .no-syllabus {
      padding: 20px 24px;
      font-size: 13px;
      color: var(--text-placeholder);
      font-style: italic;
    }
  `],
})
export class ClassProgressComponent implements OnInit {
  auth = inject(AdminAuthService);
  private providers = inject(ProvidersService);
  private syllabus = inject(SyllabusService);
  private progress = inject(ClassProgressService);

  readonly circumference = 2 * Math.PI * 16;

  loading = signal(true);
  cards = signal<ProgressCard[]>([]);
  toast = signal('');
  selectedKey = signal<string | null>(null);

  selected = computed(() => {
    const key = this.selectedKey();
    return key ? (this.cards().find(c => c.key === key) ?? null) : null;
  });

  cardsByCenter = computed(() => {
    const map = new Map<string, ProgressCard[]>();
    for (const c of this.cards()) {
      const list = map.get(c.centerName) ?? [];
      list.push(c);
      map.set(c.centerName, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([centerName, cards]) => ({ centerName, cards }));
  });

  canEdit = computed(() => this.auth.isAdmin() || this.auth.userProfile()?.canEditContent === true);

  private assignedCenters = signal(true);
  emptyMessage = computed(() =>
    this.assignedCenters()
      ? 'No classes are linked to your tuition centers yet. An admin can link them on the Classes page.'
      : 'No tuition center is assigned to your account yet. Ask an admin to assign one.',
  );

  async ngOnInit() {
    const [prov, cls] = await Promise.all([this.providers.listProviders(), this.providers.listClasses()]);
    const names = new Map((prov.data ?? []).map(p => [p.id, p.name || p.id]));

    const centerIds = this.auth.isAdmin()
      ? new Set(names.keys())
      : new Set(this.auth.userProfile()?.tuitionCenterIds ?? []);
    this.assignedCenters.set(centerIds.size > 0);

    const linked = (cls.data ?? []).filter(c => c.providerId && centerIds.has(c.providerId));
    const cards = await Promise.all(linked.map(async (c): Promise<ProgressCard> => {
      const centerId = c.providerId!;
      const catalogId = c.classId || c.id;
      const [syl, curCode] = await Promise.all([
        this.syllabus.loadAnyClass(catalogId).catch(() => null),
        this.progress.getCurrentChapter(c.id, centerId).catch(() => null),
      ]);
      return {
        key: `${c.id}|${centerId}`,
        docId: c.id,
        classId: catalogId,
        centerId,
        centerName: names.get(centerId) ?? centerId,
        className: c.title ?? syl?.className ?? c.name ?? c.className ?? catalogId,
        chapters: (syl?.subjects ?? []).flatMap(s => s.chapters).filter(ch => ch.enabled !== false),
        curCode,
        saving: false,
        saved: false,
      };
    }));
    this.cards.set(cards.sort((a, b) => a.centerName.localeCompare(b.centerName) || a.className.localeCompare(b.className)));
    this.loading.set(false);
  }

  selectCard(g: ProgressCard | null) {
    this.selectedKey.set(g ? g.key : null);
  }

  scrollRow(el: HTMLElement) {
    el.scrollBy({ left: 240, behavior: 'smooth' });
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

  pick(g: ProgressCard, i: number) {
    const target = g.chapters[i];
    if (target.code === g.curCode) return;
    const cur = this.currentIdx(g);

    if (i < cur - 1) {
      alert(`You can only go back one chapter at a time.\nTo set an earlier chapter, please ask your admin.`);
      return;
    }

    if (i === cur - 1) {
      if (!confirm(`Go back to Chapter ${i + 1}: "${target.name}"?\nThe current chapter will be marked as not done.`)) return;
      this.setChapter(g, target.code);
      return;
    }

    const label = cur < 0
      ? `Start with Chapter ${i + 1}: "${target.name}"?`
      : `Jump to Chapter ${i + 1}: "${target.name}"?\nChapters in between will be marked as done.`;
    if (!confirm(label)) return;
    this.setChapter(g, target.code);
  }

  confirmAndSetNext(g: ProgressCard, nextCode: string, nextName: string, nextNum: number) {
    const cur = this.currentIdx(g);
    const curName = cur >= 0 ? g.chapters[cur].name : '(not started)';
    const msg = cur < 0
      ? `Start teaching Chapter 1: "${nextName}"?`
      : `Mark Chapter ${cur + 1}: "${curName}" as done\nand move to Chapter ${nextNum}: "${nextName}"?`;
    if (!confirm(msg)) return;
    this.setChapter(g, nextCode);
  }

  async setChapter(g: ProgressCard, code: string) {
    const previous = g.curCode;
    this.toast.set('');
    this.patch(g.key, { curCode: code, saving: true, saved: false });
    const res = await this.progress.setCurrentChapter(g.docId, g.centerId, code);
    if (!res.ok) {
      this.patch(g.key, { curCode: previous });
      this.toast.set(`Couldn't save: ${res.message ?? 'permission denied'}`);
    } else {
      this.patch(g.key, { saved: true });
      setTimeout(() => this.patch(g.key, { saved: false }), 2500);
    }
    this.patch(g.key, { saving: false });
  }

  private patch(key: string, change: Partial<ProgressCard>) {
    this.cards.update(cs => cs.map(c => (c.key === key ? { ...c, ...change } : c)));
  }
}
