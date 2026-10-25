import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CentersService } from '../centers.service';
import { BatchesService } from '../../batches/batches.service';
import { CenterDoc, CenterMember } from '../../../models/center/center.model';
import { BatchDoc } from '../../../models/batch/batch.model';

type Tab = 'overview' | 'batches' | 'members' | 'audit';

@Component({
  selector: 'app-center-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page" *ngIf="center()">
      <header class="page-header">
        <a routerLink="/centers" class="back-link">← Centers</a>
        <div class="header-main">
          <div class="center-initials">{{ initials(center()!.name) }}</div>
          <div>
            <h1>{{ center()!.name }}</h1>
            <p>{{ center()!.city }} · {{ center()!.publication }}</p>
          </div>
        </div>
        <div class="header-actions">
          <a [routerLink]="['/centers', centerId, 'edit']" class="btn-outline">Edit</a>
          <a [routerLink]="['/centers', centerId, 'batches', 'new']" class="btn-primary">+ New Batch</a>
        </div>
      </header>

      <nav class="tabs">
        <button *ngFor="let tab of tabList" (click)="activeTab.set(tab.key)" [class.active]="activeTab() === tab.key" class="tab-btn">
          {{ tab.label }}
        </button>
      </nav>

      <!-- Overview -->
      <section *ngIf="activeTab() === 'overview'" class="tab-content">
        <div class="info-grid">
          <div class="info-card">
            <h3>Center Info</h3>
            <dl>
              <dt>Name</dt><dd>{{ center()!.name }}</dd>
              <dt>Slug</dt><dd>/{{ center()!.slug }}</dd>
              <dt>City</dt><dd>{{ center()!.city }}</dd>
              <dt>Summary</dt><dd>{{ center()!.summary }}</dd>
              <dt>Publication</dt><dd>{{ center()!.publication }}</dd>
              <dt>Approval</dt><dd>{{ center()!.approvalStatus }}</dd>
            </dl>
          </div>
          <div class="info-card">
            <h3>Offered Curricula</h3>
            <div class="tag-list">
              <span *ngFor="let cls of center()!.offeredSyllabusClassIds" class="tag">{{ cls }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Batches -->
      <section *ngIf="activeTab() === 'batches'" class="tab-content">
        <div *ngIf="batchesLoading()" class="loading">Loading batches…</div>
        <div *ngIf="!batchesLoading() && batches().length === 0" class="empty">
          No batches yet. <a [routerLink]="['/centers', centerId, 'batches', 'new']">Create one →</a>
        </div>
        <div class="list" *ngIf="!batchesLoading()">
          <div *ngFor="let b of batches()" class="list-item">
            <div class="list-item-main">
              <span class="batch-name">{{ b.name }}</span>
              <span class="batch-meta">{{ b.classId }} · {{ b.subjectCode }}</span>
            </div>
            <div class="list-item-end">
              <span class="status-badge" [class]="b.status">{{ b.status }}</span>
              <a [routerLink]="['/centers', centerId, 'batches', b.batchId]" class="btn-sm">View</a>
            </div>
          </div>
        </div>
      </section>

      <!-- Members -->
      <section *ngIf="activeTab() === 'members'" class="tab-content">
        <div *ngIf="membersLoading()" class="loading">Loading members…</div>
        <div *ngIf="!membersLoading() && members().length === 0" class="empty">No members added yet.</div>
        <div class="list" *ngIf="!membersLoading()">
          <div *ngFor="let m of members()" class="list-item">
            <span>{{ m.uid }}</span>
            <span class="role-badge">{{ m.role }}</span>
          </div>
        </div>
      </section>

      <!-- Audit -->
      <section *ngIf="activeTab() === 'audit'" class="tab-content">
        <p class="muted">Audit log coming in Phase 1 implementation.</p>
      </section>
    </div>

    <div *ngIf="!center() && !loading()" class="empty-page">Center not found.</div>
    <div *ngIf="loading()" class="empty-page">Loading…</div>
  `,
  styles: [`
    .page { max-width: 1100px; margin: 0 auto; }

    .back-link { color: var(--brand); text-decoration: none; font-size: 14px; display: block; margin-bottom: 16px; }

    .page-header {
      margin-bottom: 24px;
    }

    .header-main {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }

    .center-initials {
      width: 56px;
      height: 56px;
      background: var(--brand);
      color: #fff;
      border-radius: var(--r-xl);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      flex-shrink: 0;
    }

    h1 { margin: 0; font-size: 22px; font-weight: 700; color: var(--text-primary); }
    p { margin: 4px 0 0; color: var(--text-muted); font-size: 14px; }

    .header-actions { display: flex; gap: 10px; }

    .btn-primary {
      padding: 9px 16px;
      background: var(--brand);
      color: #fff;
      border-radius: var(--r-md);
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
    }

    .btn-outline {
      padding: 9px 16px;
      border: 1px solid var(--border-default);
      border-radius: var(--r-md);
      text-decoration: none;
      color: var(--text-secondary);
      font-size: 14px;
    }

    .tabs {
      display: flex;
      gap: 4px;
      border-bottom: 2px solid var(--border-default);
      margin-bottom: 24px;
    }

    .tab-btn {
      padding: 10px 18px;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      color: var(--text-muted);
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
    }

    .tab-btn.active { color: var(--brand); border-bottom-color: var(--brand); font-weight: 600; }

    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

    .info-card {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-xl);
      padding: 20px;
      box-shadow: var(--shadow-sm);
    }

    h3 { margin: 0 0 14px; font-size: 15px; font-weight: 600; color: var(--text-primary); }

    dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; }
    dt { color: var(--text-muted); font-size: 13px; font-weight: 500; }
    dd { color: var(--text-primary); font-size: 13px; margin: 0; }

    .tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { padding: 4px 10px; background: var(--brand-subtle); color: var(--brand-text); border-radius: var(--r-full); font-size: 12px; }

    .loading { color: var(--text-muted); padding: 20px 0; }

    .empty {
      padding: 40px;
      text-align: center;
      color: var(--text-muted);
      font-size: 14px;
    }

    .empty a { color: var(--brand); }

    .list { display: flex; flex-direction: column; gap: 8px; }

    .list-item {
      background: var(--surface-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--r-md);
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: var(--shadow-sm);
    }

    .list-item-main { display: flex; flex-direction: column; gap: 2px; }
    .batch-name { font-weight: 600; font-size: 14px; color: var(--text-primary); }
    .batch-meta { font-size: 12px; color: var(--text-muted); }

    .list-item-end { display: flex; align-items: center; gap: 10px; }

    .status-badge {
      padding: 3px 10px;
      border-radius: var(--r-full);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-badge.active { background: var(--success-bg); color: var(--success-text); }
    .status-badge.draft { background: var(--warning-bg); color: var(--warning-text); }
    .status-badge.completed { background: var(--info-bg); color: var(--info-text); }
    .status-badge.archived { background: var(--surface-secondary); color: var(--text-secondary); }

    .role-badge { padding: 3px 10px; background: var(--brand-muted); color: var(--brand-text); border-radius: var(--r-full); font-size: 11px; }

    .btn-sm {
      padding: 6px 12px;
      background: var(--surface-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--r-sm);
      text-decoration: none;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .empty-page { padding: 80px; text-align: center; color: var(--text-muted); }
    .muted { color: var(--text-placeholder); font-size: 13px; }
  `],
})
export class CenterDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private centersService = inject(CentersService);
  private batchesService = inject(BatchesService);

  centerId = '';
  center = signal<CenterDoc | null>(null);
  batches = signal<BatchDoc[]>([]);
  members = signal<CenterMember[]>([]);
  loading = signal(true);
  batchesLoading = signal(false);
  membersLoading = signal(false);
  activeTab = signal<Tab>('overview');

  tabList = [
    { key: 'overview' as Tab, label: 'Overview' },
    { key: 'batches' as Tab, label: 'Batches' },
    { key: 'members' as Tab, label: 'Members' },
    { key: 'audit' as Tab, label: 'Audit' },
  ];

  async ngOnInit() {
    this.centerId = this.route.snapshot.paramMap.get('centerId')!;
    const res = await this.centersService.getCenter(this.centerId);
    this.center.set(res.data ?? null);
    this.loading.set(false);

    this.loadBatches();
    this.loadMembers();
  }

  async loadBatches() {
    this.batchesLoading.set(true);
    const res = await this.batchesService.listBatches(this.centerId);
    this.batches.set(res.data ?? []);
    this.batchesLoading.set(false);
  }

  async loadMembers() {
    this.membersLoading.set(true);
    const res = await this.centersService.getMembers(this.centerId);
    this.members.set(res.data ?? []);
    this.membersLoading.set(false);
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}
