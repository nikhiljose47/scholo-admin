import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BatchesService } from '../batches.service';
import { BatchDoc } from '../../../models/batch/batch.model';

@Component({
  selector: 'app-batches-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <header class="page-header">
        <a [routerLink]="['/centers', centerId]" class="back-link">← Center</a>
        <div class="header-row">
          <h1>Batches</h1>
          <a [routerLink]="['/centers', centerId, 'batches', 'new']" class="btn-primary">+ New Batch</a>
        </div>
      </header>

      <div *ngIf="loading()" class="loading">Loading batches…</div>

      <div *ngIf="!loading() && batches().length === 0" class="empty">
        <span>📚</span>
        <p>No batches yet for this center.</p>
        <a [routerLink]="['/centers', centerId, 'batches', 'new']" class="btn-primary">Create First Batch</a>
      </div>

      <div class="list" *ngIf="!loading() && batches().length > 0">
        <div *ngFor="let b of batches()" class="batch-card">
          <div class="batch-header">
            <div>
              <h3>{{ b.name }}</h3>
              <p>{{ b.classId }} · {{ b.subjectCode }}</p>
            </div>
            <span class="status-badge" [class]="b.status">{{ b.status }}</span>
          </div>
          <div class="batch-meta">
            <span>👨‍🏫 {{ b.teacherUids.length }} teacher(s)</span>
            <span>👩‍🎓 {{ b.enrolledCount }} enrolled</span>
            <span>📅 {{ b.academicYear }}</span>
          </div>
          <div class="batch-actions">
            <a [routerLink]="['/centers', centerId, 'batches', b.batchId]" class="btn-sm">View Details</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 900px; margin: 0 auto; }

    .back-link { color: var(--brand); text-decoration: none; font-size: 14px; display: block; margin-bottom: 12px; }

    .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }

    h1 { margin: 0; font-size: 22px; font-weight: 700; color: var(--text-primary); }

    .btn-primary {
      padding: 9px 16px;
      background: var(--brand);
      color: var(--text-inverse);
      border-radius: 8px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
    }

    .loading { color: var(--text-muted); padding: 20px; }

    .empty {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
    }

    .empty span { font-size: 48px; display: block; margin-bottom: 12px; }

    .list { display: flex; flex-direction: column; gap: 12px; }

    .batch-card {
      background: var(--surface-primary);
      border-radius: 12px;
      padding: 20px;
      box-shadow: var(--shadow-sm);
    }

    .batch-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }

    h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary); }
    p { margin: 4px 0 0; color: var(--text-muted); font-size: 13px; }

    .status-badge {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-badge.active { background: var(--success-bg); color: var(--success-text); }
    .status-badge.draft { background: var(--warning-bg); color: var(--warning-text); }
    .status-badge.completed { background: var(--info-bg); color: var(--info-text); }
    .status-badge.paused { background: var(--warning-bg); color: var(--warning-text); }
    .status-badge.archived { background: var(--surface-secondary); color: var(--text-muted); }

    .batch-meta { display: flex; gap: 20px; font-size: 13px; color: var(--text-muted); margin-bottom: 14px; }

    .batch-actions { display: flex; gap: 8px; }

    .btn-sm {
      padding: 7px 14px;
      border: 1px solid var(--border-default);
      border-radius: 6px;
      text-decoration: none;
      font-size: 13px;
      color: var(--text-secondary);
    }
  `],
})
export class BatchesListComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private service = inject(BatchesService);

  centerId = '';
  batches = signal<BatchDoc[]>([]);
  loading = signal(true);

  async ngOnInit() {
    this.centerId = this.route.snapshot.paramMap.get('centerId')!;
    const res = await this.service.listBatches(this.centerId);
    this.batches.set(res.data ?? []);
    this.loading.set(false);
  }
}
