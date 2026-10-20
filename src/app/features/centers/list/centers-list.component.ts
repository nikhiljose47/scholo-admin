import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CentersService } from '../centers.service';
import { CenterDoc } from '../../../models/center/center.model';

@Component({
  selector: 'app-centers-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Tuition Centers</h1>
          <p>Manage all partnered centers on the platform</p>
        </div>
        <a routerLink="/centers/new" class="btn-primary">+ Add Center</a>
      </header>

      <div class="toolbar">
        <input
          type="search"
          placeholder="Search centers…"
          [(ngModel)]="search"
          class="search-input"
        />
        <select [(ngModel)]="statusFilter" class="filter-select">
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div *ngIf="loading()" class="loading-state">Loading centers…</div>

      <div *ngIf="!loading() && filtered().length === 0" class="empty-state">
        <span>🏫</span>
        <p>No centers found.</p>
        <a routerLink="/centers/new" class="btn-primary">Add your first center</a>
      </div>

      <div class="centers-grid" *ngIf="!loading() && filtered().length > 0">
        <div *ngFor="let center of filtered()" class="center-card">
          <div class="card-header">
            <div class="center-initials">{{ initials(center.name) }}</div>
            <span class="status-badge" [class]="center.publication">{{ center.publication }}</span>
          </div>
          <div class="card-body">
            <h3>{{ center.name }}</h3>
            <p class="summary">{{ center.summary }}</p>
            <p class="city">📍 {{ center.city }}</p>
            <div class="syllabus-tags">
              <span *ngFor="let c of center.offeredSyllabusClassIds" class="tag">{{ c }}</span>
            </div>
          </div>
          <div class="card-actions">
            <a [routerLink]="['/centers', center.centerId]" class="btn-secondary">View</a>
            <a [routerLink]="['/centers', center.centerId, 'batches']" class="btn-outline">Batches</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 1200px; margin: 0 auto; }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }

    h1 { margin: 0; font-size: 22px; font-weight: 700; color: #1e293b; }
    p { margin: 4px 0 0; color: #64748b; font-size: 14px; }

    .btn-primary {
      padding: 10px 18px;
      background: #3b82f6;
      color: #fff;
      border-radius: 8px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
    }

    .toolbar {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
    }

    .search-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
    }

    .filter-select {
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
    }

    .loading-state, .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #64748b;
    }

    .empty-state span { font-size: 48px; display: block; margin-bottom: 12px; }

    .centers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .center-card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      overflow: hidden;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    .center-initials {
      width: 40px;
      height: 40px;
      background: #3b82f6;
      color: #fff;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }

    .status-badge {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-badge.published { background: #d1fae5; color: #065f46; }
    .status-badge.draft { background: #fef3c7; color: #92400e; }
    .status-badge.archived { background: #f1f5f9; color: #475569; }

    .card-body { padding: 16px; }

    h3 { margin: 0 0 6px; font-size: 16px; color: #1e293b; }

    .summary {
      color: #64748b;
      font-size: 13px;
      margin: 0 0 8px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .city { color: #64748b; font-size: 13px; margin: 0 0 10px; }

    .syllabus-tags { display: flex; flex-wrap: wrap; gap: 4px; }

    .tag {
      padding: 2px 8px;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 10px;
      font-size: 11px;
    }

    .card-actions {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #f1f5f9;
    }

    .btn-secondary {
      padding: 7px 14px;
      background: #3b82f6;
      color: #fff;
      border-radius: 6px;
      text-decoration: none;
      font-size: 13px;
    }

    .btn-outline {
      padding: 7px 14px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      text-decoration: none;
      color: #374151;
      font-size: 13px;
    }
  `],
})
export class CentersListComponent implements OnInit {
  private service = inject(CentersService);

  centers = signal<CenterDoc[]>([]);
  loading = signal(true);
  search = '';
  statusFilter = '';

  filtered() {
    return this.centers().filter(c => {
      const matchesSearch = !this.search || c.name.toLowerCase().includes(this.search.toLowerCase());
      const matchesStatus = !this.statusFilter || c.publication === this.statusFilter;
      return matchesSearch && matchesStatus;
    });
  }

  async ngOnInit() {
    const res = await this.service.listCenters();
    this.centers.set(res.data ?? []);
    this.loading.set(false);
  }

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}
