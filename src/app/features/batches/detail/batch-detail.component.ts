import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BatchesService } from '../batches.service';
import { BatchDoc, PlanChapterDoc, PlanItemDoc, SectionProgressStatus } from '../../../models/batch/batch.model';
import { AdminAuthService } from '../../../core/services/auth/admin-auth.service';

type Tab = 'plan' | 'enrollments' | 'progress' | 'audit';

@Component({
  selector: 'app-batch-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page" *ngIf="batch()">
      <header class="page-header">
        <a [routerLink]="['/centers', centerId, 'batches']" class="back-link">← Batches</a>
        <div class="header-row">
          <div>
            <h1>{{ batch()!.name }}</h1>
            <p>{{ batch()!.classId }} · {{ batch()!.subjectCode }} · {{ batch()!.academicYear }}</p>
          </div>
          <span class="status-badge large" [class]="batch()!.status">{{ batch()!.status }}</span>
        </div>
      </header>

      <!-- Progress summary bar -->
      <div class="progress-bar-wrap">
        <div class="progress-label">
          <span>Teaching Progress</span>
          <span class="progress-pct">{{ progressPct() }}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" [style.width.%]="progressPct()"></div>
        </div>
        <div class="progress-counts">
          {{ completedCount() }} / {{ totalCount() }} sections completed
        </div>
      </div>

      <nav class="tabs">
        <button *ngFor="let tab of tabList" (click)="activeTab.set(tab.key)" [class.active]="activeTab() === tab.key" class="tab-btn">
          {{ tab.label }}
        </button>
      </nav>

      <!-- Plan tab -->
      <section *ngIf="activeTab() === 'plan'" class="tab-content">
        <div *ngIf="planLoading()" class="loading">Loading plan…</div>

        <div *ngIf="!planLoading()" class="chapters-list">
          <div *ngFor="let ch of chapters()" class="chapter-block">
            <div class="chapter-header">
              <span class="chapter-title">{{ ch.title }}</span>
              <span class="chapter-code" *ngIf="ch.canonicalChapterCode">{{ ch.canonicalChapterCode }}</span>
            </div>
            <div class="items-list">
              <div *ngFor="let item of itemsByChapter(ch.chapterInstanceId)" class="plan-item">
                <div class="item-info">
                  <span class="item-title">{{ item.title }}</span>
                  <span class="item-code" *ngIf="item.canonicalDivisionCode">{{ item.canonicalDivisionCode }}</span>
                </div>
                <div class="item-controls">
                  <span class="progress-chip" [class]="item.progress.status">
                    {{ formatStatus(item.progress.status) }}
                  </span>
                  <div class="status-buttons">
                    <button
                      (click)="setProgress(item, 'not_started')"
                      [disabled]="item.progress.status === 'not_started'"
                      class="btn-status not-started"
                      title="Not started"
                    >○</button>
                    <button
                      (click)="setProgress(item, 'in_progress')"
                      [disabled]="item.progress.status === 'in_progress'"
                      class="btn-status in-progress"
                      title="In progress"
                    >◐</button>
                    <button
                      (click)="setProgress(item, 'completed')"
                      [disabled]="item.progress.status === 'completed'"
                      class="btn-status completed"
                      title="Completed"
                    >●</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div *ngIf="chapters().length === 0" class="empty">
            No plan chapters assigned yet.
          </div>
        </div>
      </section>

      <!-- Enrollments tab -->
      <section *ngIf="activeTab() === 'enrollments'" class="tab-content">
        <div class="enrollments-header">
          <span>{{ enrollmentCount() }} students enrolled</span>
        </div>
        <p class="muted">Enrollment management coming in Phase 3.</p>
      </section>

      <!-- Progress history tab -->
      <section *ngIf="activeTab() === 'progress'" class="tab-content">
        <p class="muted">Progress history (immutable audit events) coming in Phase 1.</p>
      </section>

      <!-- Audit tab -->
      <section *ngIf="activeTab() === 'audit'" class="tab-content">
        <p class="muted">Full audit log coming in Phase 1.</p>
      </section>
    </div>

    <div *ngIf="!batch() && !loading()" class="empty-page">Batch not found.</div>
    <div *ngIf="loading()" class="empty-page">Loading…</div>
  `,
  styles: [`
    .page { max-width: 1000px; margin: 0 auto; }

    .back-link { color: #3b82f6; text-decoration: none; font-size: 14px; display: block; margin-bottom: 12px; }

    .header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }

    h1 { margin: 0; font-size: 22px; font-weight: 700; color: #1e293b; }
    p { margin: 4px 0 0; color: #64748b; font-size: 14px; }

    .status-badge {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-badge.large { font-size: 13px; padding: 6px 14px; }

    .status-badge.active { background: #d1fae5; color: #065f46; }
    .status-badge.draft { background: #fef3c7; color: #92400e; }
    .status-badge.completed { background: #eff6ff; color: #1d4ed8; }
    .status-badge.archived { background: #f1f5f9; color: #475569; }

    .progress-bar-wrap {
      background: #fff;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }

    .progress-label { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #374151; }
    .progress-pct { font-weight: 700; color: #3b82f6; }

    .progress-track { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
    .progress-fill { height: 100%; background: #3b82f6; transition: width 0.3s; }

    .progress-counts { font-size: 12px; color: #94a3b8; }

    .tabs { display: flex; gap: 4px; border-bottom: 2px solid #e2e8f0; margin-bottom: 24px; }

    .tab-btn {
      padding: 10px 18px;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      color: #64748b;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
    }

    .tab-btn.active { color: #3b82f6; border-bottom-color: #3b82f6; font-weight: 600; }

    .loading { color: #64748b; padding: 20px; }

    .chapters-list { display: flex; flex-direction: column; gap: 16px; }

    .chapter-block {
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      overflow: hidden;
    }

    .chapter-header {
      background: #f8fafc;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid #e2e8f0;
    }

    .chapter-title { font-weight: 600; font-size: 14px; color: #1e293b; }
    .chapter-code { font-size: 11px; color: #94a3b8; background: #e2e8f0; padding: 2px 8px; border-radius: 4px; }

    .items-list { padding: 4px 0; }

    .plan-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      border-bottom: 1px solid #f8fafc;
    }

    .plan-item:last-child { border-bottom: none; }

    .item-info { display: flex; flex-direction: column; gap: 2px; }
    .item-title { font-size: 14px; color: #1e293b; }
    .item-code { font-size: 11px; color: #94a3b8; }

    .item-controls { display: flex; align-items: center; gap: 10px; }

    .progress-chip {
      padding: 3px 10px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .progress-chip.not_started { background: #f1f5f9; color: #64748b; }
    .progress-chip.in_progress { background: #fef3c7; color: #92400e; }
    .progress-chip.completed { background: #d1fae5; color: #065f46; }

    .status-buttons { display: flex; gap: 4px; }

    .btn-status {
      width: 28px;
      height: 28px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .btn-status:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-status.in-progress:not(:disabled):hover { background: #fef3c7; }
    .btn-status.completed:not(:disabled):hover { background: #d1fae5; }

    .empty { padding: 40px; text-align: center; color: #64748b; }
    .empty-page { padding: 80px; text-align: center; color: #64748b; }
    .muted { color: #94a3b8; font-size: 13px; padding: 12px 0; }

    .enrollments-header { font-size: 14px; color: #374151; margin-bottom: 12px; }
  `],
})
export class BatchDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private service = inject(BatchesService);
  private auth = inject(AdminAuthService);

  centerId = '';
  batchId = '';
  batch = signal<BatchDoc | null>(null);
  chapters = signal<PlanChapterDoc[]>([]);
  planItems = signal<PlanItemDoc[]>([]);
  loading = signal(true);
  planLoading = signal(false);
  activeTab = signal<Tab>('plan');
  enrollmentCount = signal(0);

  tabList = [
    { key: 'plan' as Tab, label: 'Teaching Plan' },
    { key: 'enrollments' as Tab, label: 'Enrollments' },
    { key: 'progress' as Tab, label: 'Progress History' },
    { key: 'audit' as Tab, label: 'Audit' },
  ];

  progressPct() {
    const total = this.totalCount();
    if (total === 0) return 0;
    return Math.round((this.completedCount() / total) * 100);
  }

  totalCount() {
    return this.planItems().filter(i => i.active).length;
  }

  completedCount() {
    return this.planItems().filter(i => i.active && i.progress.status === 'completed').length;
  }

  itemsByChapter(chapterInstanceId: string) {
    return this.planItems().filter(i => i.chapterInstanceId === chapterInstanceId);
  }

  formatStatus(s: SectionProgressStatus) {
    return s === 'not_started' ? 'Not Started' : s === 'in_progress' ? 'In Progress' : 'Completed';
  }

  async ngOnInit() {
    this.centerId = this.route.snapshot.paramMap.get('centerId')!;
    this.batchId = this.route.snapshot.paramMap.get('batchId')!;

    const res = await this.service.getBatch(this.centerId, this.batchId);
    this.batch.set(res.data ?? null);
    this.loading.set(false);

    this.loadPlan();
  }

  async loadPlan() {
    this.planLoading.set(true);
    const [chaptersRes, itemsRes] = await Promise.all([
      this.service.listPlanChapters(this.centerId, this.batchId),
      this.service.listPlanItems(this.centerId, this.batchId),
    ]);
    this.chapters.set(chaptersRes.data ?? []);
    this.planItems.set(itemsRes.data ?? []);
    this.planLoading.set(false);
  }

  async setProgress(item: PlanItemDoc, toStatus: SectionProgressStatus) {
    await this.service.updateSectionProgress(
      this.centerId,
      this.batchId,
      item.sectionInstanceId,
      item.progress.status,
      toStatus,
    );
    // Optimistically update local state
    this.planItems.update(items =>
      items.map(i =>
        i.sectionInstanceId === item.sectionInstanceId
          ? { ...i, progress: { ...i.progress, status: toStatus } }
          : i,
      ),
    );
  }
}
