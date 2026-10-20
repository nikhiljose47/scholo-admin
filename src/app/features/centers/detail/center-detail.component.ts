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

    .back-link { color: #3b82f6; text-decoration: none; font-size: 14px; display: block; margin-bottom: 16px; }

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
      background: #3b82f6;
      color: #fff;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
    }

    h1 { margin: 0; font-size: 22px; font-weight: 700; color: #1e293b; }
    p { margin: 4px 0 0; color: #64748b; font-size: 14px; }

    .header-actions { display: flex; gap: 10px; }

    .btn-primary {
      padding: 9px 16px;
      background: #3b82f6;
      color: #fff;
      border-radius: 8px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
    }

    .btn-outline {
      padding: 9px 16px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      text-decoration: none;
      color: #374151;
      font-size: 14px;
    }

    .tabs {
      display: flex;
      gap: 4px;
      border-bottom: 2px solid #e2e8f0;
      margin-bottom: 24px;
    }

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

    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

    .info-card {
      background: #fff;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }

    h3 { margin: 0 0 14px; font-size: 15px; font-weight: 600; color: #1e293b; }

    dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; }
    dt { color: #64748b; font-size: 13px; font-weight: 500; }
    dd { color: #1e293b; font-size: 13px; margin: 0; }

    .tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { padding: 4px 10px; background: #eff6ff; color: #1d4ed8; border-radius: 12px; font-size: 12px; }

    .loading { color: #64748b; padding: 20px 0; }

    .empty {
      padding: 40px;
      text-align: center;
      color: #64748b;
      font-size: 14px;
    }

    .empty a { color: #3b82f6; }

    .list { display: flex; flex-direction: column; gap: 8px; }

    .list-item {
      background: #fff;
      border-radius: 8px;
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }

    .list-item-main { display: flex; flex-direction: column; gap: 2px; }
    .batch-name { font-weight: 600; font-size: 14px; color: #1e293b; }
    .batch-meta { font-size: 12px; color: #64748b; }

    .list-item-end { display: flex; align-items: center; gap: 10px; }

    .status-badge {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-badge.active { background: #d1fae5; color: #065f46; }
    .status-badge.draft { background: #fef3c7; color: #92400e; }
    .status-badge.completed { background: #eff6ff; color: #1d4ed8; }
    .status-badge.archived { background: #f1f5f9; color: #475569; }

    .role-badge { padding: 3px 10px; background: #f3e8ff; color: #6b21a8; border-radius: 12px; font-size: 11px; }

    .btn-sm {
      padding: 6px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      text-decoration: none;
      font-size: 12px;
      color: #374151;
    }

    .empty-page { padding: 80px; text-align: center; color: #64748b; }
    .muted { color: #94a3b8; font-size: 13px; }
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
