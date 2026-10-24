import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SyllabusService } from '../schedule/syllabus.service';
import { ProvidersService } from '../providers/providers.service';
import { ClassProgressService } from './class-progress.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { Chapter } from '../../models/syllabus/syllabus.model';

/** One syllabus class taught at one tuition center — the unit progress is tracked for. */
interface ProgressCard {
  key: string;
  /** Firestore doc id — used as the Firestore path key for progress. */
  docId: string;
  /** Syllabus catalog id (e.g. "CL09_MATH") — used for syllabus lookup and chapter codes. */
  classId: string;
  centerId: string;
  centerName: string;
  className: string;
  chapters: Chapter[];
  curCode: string | null;
  saving: boolean;
  saved: boolean;
  open: boolean;
}

@Component({
  selector: 'app-class-progress',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Class Progress</h1>
        <p>After finishing a chapter in class, press the green button to move to the next one.</p>
      </header>

      <div class="notice warn" *ngIf="!canEdit()">
        🔒 You can view progress but cannot update it. Ask an admin to enable the "can edit content" permission for your account.
      </div>
      <div class="notice error" *ngIf="toast() as t">⚠ {{ t }}</div>

      <div *ngIf="loading()" class="loading">Loading your classes…</div>

      <div *ngIf="!loading() && !cards().length" class="empty">
        <span>🎯</span>
        <p>{{ emptyMessage() }}</p>
      </div>

      <!-- One section per tuition center -->
      <ng-container *ngFor="let group of cardsByCenter()">
        <section class="center-section">
          <h2 class="center-heading">🏫 {{ group.centerName }}</h2>
          <div class="grid">
            <article class="card" *ngFor="let g of group.cards">

              <div class="card-top">
                <h3>{{ g.className }}</h3>
                <div class="progress-ring">
                  <svg viewBox="0 0 40 40" width="48" height="48">
                    <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" stroke-width="4"/>
                    <circle cx="20" cy="20" r="16" fill="none" stroke="#22c55e" stroke-width="4"
                      [attr.stroke-dasharray]="circumference"
                      [attr.stroke-dashoffset]="circumference - (pct(g) / 100) * circumference"
                      stroke-linecap="round" transform="rotate(-90 20 20)"/>
                  </svg>
                  <span class="ring-pct">{{ pct(g) }}%</span>
                </div>
              </div>

              <ng-container *ngIf="g.chapters.length; else noSyllabus">
                <div class="bar"><div class="fill" [style.width.%]="pct(g)"></div></div>
                <div class="bar-label">{{ doneCount(g) }} of {{ g.chapters.length }} chapters completed</div>

                <div class="current-box">
                  <div class="current-label">
                    {{ currentIdx(g) >= 0 ? 'Currently teaching — Chapter ' + (currentIdx(g) + 1) + ' of ' + g.chapters.length : 'Not started yet' }}
                  </div>
                  <div class="current-name">
                    {{ currentIdx(g) >= 0 ? g.chapters[currentIdx(g)].name : g.chapters[0].name }}
                  </div>

                  <div class="saved-msg" *ngIf="g.saved">✅ Saved!</div>

                  <div class="actions" *ngIf="!g.saved">
                    <button class="btn-start" *ngIf="currentIdx(g) < 0"
                            [disabled]="!canEdit() || g.saving"
                            (click)="confirmAndSetNext(g, g.chapters[0].code, g.chapters[0].name, 1)">
                      {{ g.saving ? 'Saving…' : '▶ Start teaching this class' }}
                    </button>
                    <button class="btn-next" *ngIf="currentIdx(g) >= 0 && currentIdx(g) < g.chapters.length - 1"
                            [disabled]="!canEdit() || g.saving"
                            (click)="confirmAndSetNext(g, g.chapters[currentIdx(g) + 1].code, g.chapters[currentIdx(g) + 1].name, currentIdx(g) + 2)">
                      <span *ngIf="!g.saving">
                        ✓ Done with this chapter<br>
                        <small>Next: Chapter {{ currentIdx(g) + 2 }} — {{ g.chapters[currentIdx(g) + 1].name }}</small>
                      </span>
                      <span *ngIf="g.saving">Saving…</span>
                    </button>
                    <div class="final-badge" *ngIf="currentIdx(g) === g.chapters.length - 1">
                      🏁 All chapters completed!
                    </div>
                  </div>
                </div>

                <button class="toggle-link" (click)="toggle(g)">
                  {{ g.open ? '▲ Hide chapter list' : '▼ Show all ' + g.chapters.length + ' chapters' }}
                </button>
                <ol class="chapter-list" *ngIf="g.open">
                  <li *ngFor="let ch of g.chapters; let i = index"
                      [class]="status(g, i)"
                      (click)="canEdit() && !g.saving && pick(g, i)"
                      [class.clickable]="canEdit()">
                    <span class="dot">{{ status(g, i) === 'done' ? '✓' : i + 1 }}</span>
                    <span class="ch-name">{{ ch.name }}</span>
                    <span class="tag" *ngIf="status(g, i) === 'current'">current</span>
                  </li>
                </ol>
              </ng-container>

              <ng-template #noSyllabus>
                <p class="no-syllabus">No syllabus linked yet. An admin can fix this on the Classes page.</p>
              </ng-template>
            </article>
          </div>
        </section>
      </ng-container>
    </div>
  `,
  styles: [`
    .page { max-width: 900px; margin: 0 auto; padding-bottom: 40px; }
    .page-header { margin-bottom: 24px; }
    h1 { margin: 0 0 4px; font-size: 24px; font-weight: 700; color: #1e293b; }
    .page-header p { margin: 0; color: #64748b; font-size: 15px; }

    .notice { padding: 12px 16px; border-radius: 10px; font-size: 14px; margin-bottom: 16px; }
    .notice.warn { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
    .notice.error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }

    .loading { color: #64748b; font-size: 15px; padding: 40px 0; text-align: center; }
    .empty { text-align: center; padding: 60px 20px; color: #64748b; }
    .empty span { font-size: 48px; display: block; margin-bottom: 10px; }
    .empty p { font-size: 15px; }

    .center-section { margin-bottom: 36px; }
    .center-heading { margin: 0 0 14px; font-size: 17px; font-weight: 700; color: #7c3aed; display: flex; align-items: center; gap: 6px; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }

    .card { background: #fff; border-radius: 14px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,.07); }
    .card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
    h3 { margin: 0; font-size: 18px; font-weight: 700; color: #1e293b; line-height: 1.3; flex: 1; }

    .progress-ring { position: relative; width: 48px; height: 48px; flex-shrink: 0; }
    .ring-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #15803d; }

    .bar { height: 8px; background: #e2e8f0; border-radius: 6px; overflow: hidden; }
    .fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #22c55e); border-radius: 6px; transition: width .4s; }
    .bar-label { font-size: 12px; color: #64748b; margin-top: 5px; margin-bottom: 14px; }

    .current-box { background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 16px; }
    .current-label { font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 4px; }
    .current-name { font-size: 17px; font-weight: 700; color: #1e293b; margin-bottom: 14px; line-height: 1.4; }
    .saved-msg { font-size: 15px; font-weight: 700; color: #15803d; text-align: center; padding: 8px 0 4px; }

    .actions { display: flex; flex-direction: column; gap: 10px; }
    .btn-start { width: 100%; padding: 12px 16px; background: #3b82f6; color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
    .btn-start:disabled { background: #cbd5e1; cursor: not-allowed; }
    .btn-next { width: 100%; padding: 14px 16px; background: #16a34a; color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; text-align: left; line-height: 1.5; }
    .btn-next small { font-size: 13px; font-weight: 400; opacity: .9; }
    .btn-next:disabled { background: #cbd5e1; cursor: not-allowed; }
    .final-badge { text-align: center; font-size: 15px; font-weight: 700; color: #15803d; padding: 8px; background: #dcfce7; border-radius: 8px; }

    .toggle-link { background: none; border: none; color: #3b82f6; cursor: pointer; font-size: 13px; padding: 12px 0 4px; display: block; }
    .chapter-list { list-style: none; margin: 6px 0 0; padding: 0; max-height: 260px; overflow-y: auto; border-radius: 8px; border: 1px solid #e2e8f0; }
    .chapter-list li { display: flex; align-items: center; gap: 10px; padding: 9px 12px; font-size: 14px; color: #64748b; border-bottom: 1px solid #f1f5f9; }
    .chapter-list li:last-child { border-bottom: none; }
    .chapter-list li.clickable { cursor: pointer; }
    .chapter-list li.clickable:hover { background: #f8fafc; }
    .dot { width: 26px; height: 26px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
    li.done { color: #15803d; }
    li.done .dot { background: #22c55e; color: #fff; }
    li.current { color: #1e293b; font-weight: 700; background: #eff6ff; }
    li.current .dot { background: #3b82f6; color: #fff; }
    .ch-name { flex: 1; }
    .tag { background: #3b82f6; color: #fff; font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
    .no-syllabus { font-size: 13px; color: #94a3b8; font-style: italic; margin: 12px 0 0; }
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

  /** Cards grouped by center, in alphabetical center order. */
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
      // catalogId is the syllabus key (e.g. "CL09_MATH"); fall back to doc id for legacy docs.
      const catalogId = c.classId || c.id;
      const [syl, curCode] = await Promise.all([
        this.syllabus.loadAnyClass(catalogId).catch(() => null),
        // Progress is stored under the Firestore doc id, not the catalog classId.
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
    const cur = this.currentIdx(g);

    // 2+ chapters back → only admin can do this
    if (i < cur - 1) {
      alert(`You can only go back one chapter at a time.\nTo set an earlier chapter, please ask your admin.`);
      return;
    }

    // 1 chapter back → allowed with confirmation
    if (i === cur - 1) {
      if (!confirm(`Go back to Chapter ${i + 1}: "${target.name}"?\nThe current chapter will be marked as not done.`)) return;
      this.setChapter(g, target.code);
      return;
    }

    // Forward (skipping chapters) → confirm
    const label = cur < 0 ? `Start with Chapter ${i + 1}: "${target.name}"?` : `Jump to Chapter ${i + 1}: "${target.name}"?\nChapters in between will be marked as done.`;
    if (!confirm(label)) return;
    this.setChapter(g, target.code);
  }

  confirmAndSetNext(g: ProgressCard, nextCode: string, nextName: string, nextNum: number) {
    const cur = this.currentIdx(g);
    const curName = cur >= 0 ? g.chapters[cur].name : '(not started)';
    const msg = cur < 0
      ? `Start teaching Chapter 1: "${nextName}"?`
      : `Mark Chapter ${cur + 1}: "${curName}" as done\nand start Chapter ${nextNum}: "${nextName}"?`;
    if (!confirm(msg)) return;
    this.setChapter(g, nextCode);
  }

  async setChapter(g: ProgressCard, code: string) {
    const previous = g.curCode;
    this.toast.set('');
    this.patch(g.key, { curCode: code, saving: true, saved: false });
    // Progress path uses the Firestore doc id (docId), not the catalog classId.
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
