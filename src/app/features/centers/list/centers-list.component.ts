import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CentersService } from '../centers.service';
import { CenterDoc } from '../../../models/center/center.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-centers-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, IconComponent],
  template: `
    <div class="page">

      <!-- Header -->
      <header class="page-header">
        <div>
          <h1 class="page-title">Tuition Centers</h1>
          <p class="page-subtitle">Manage all partnered centers on the platform</p>
        </div>
        <div class="header-actions">
          <a routerLink="/centers/new" class="btn btn-primary">
            <sc-icon name="plus" [size]="15" [stroke]="2.5"></sc-icon>
            Add Center
          </a>
        </div>
      </header>

      <!-- Toolbar -->
      <div class="toolbar">
        <div class="search-wrap">
          <sc-icon name="search" [size]="15" class="search-icon"></sc-icon>
          <input
            type="search"
            placeholder="Search centers…"
            [(ngModel)]="search"
            class="search-input"
          />
        </div>
        <select [(ngModel)]="statusFilter" class="select">
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <!-- Loading -->
      <div *ngIf="loading()" class="loading-state">Loading centers</div>

      <!-- Empty -->
      <div *ngIf="!loading() && filtered().length === 0" class="empty-state">
        <div class="empty-icon">🏫</div>
        <p class="empty-title">No centers found</p>
        <p class="empty-body">{{ search || statusFilter ? 'Try adjusting your filters.' : 'Get started by adding your first center.' }}</p>
        <a *ngIf="!search && !statusFilter" routerLink="/centers/new" class="btn btn-primary">Add your first center</a>
      </div>

      <!-- Grid -->
      <div class="centers-grid" *ngIf="!loading() && filtered().length > 0">
        <div *ngFor="let center of filtered()" class="center-card card">

          <!-- Card header -->
          <div class="card-header">
            <div class="center-avatar">{{ initials(center.name) }}</div>
            <div class="card-header-info">
              <h3 class="center-name truncate">{{ center.name }}</h3>
              <div class="center-city">
                <sc-icon name="buildings" [size]="12" [stroke]="1.5"></sc-icon>
                {{ center.city }}
              </div>
            </div>
            <span
              class="badge"
              [class.badge-success]="center.publication === 'published'"
              [class.badge-warning]="center.publication === 'draft'"
              [class.badge-neutral]="center.publication === 'archived'"
            >{{ center.publication }}</span>
          </div>

          <!-- Card body -->
          <div class="card-body">
            <p class="center-summary" *ngIf="center.summary">{{ center.summary }}</p>
            <div class="syllabus-tags" *ngIf="center.offeredSyllabusClassIds?.length">
              <span *ngFor="let c of center.offeredSyllabusClassIds" class="tag">{{ c }}</span>
            </div>
          </div>

          <!-- Card footer -->
          <div class="card-footer">
            <a [routerLink]="['/centers', center.centerId]" class="btn btn-secondary btn-sm">View</a>
            <a [routerLink]="['/centers', center.centerId, 'batches']" class="btn btn-ghost btn-sm">Batches</a>
          </div>

        </div>
      </div>

    </div>
  `,
  styles: [`
    /* Toolbar */
    .search-wrap {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: 10px;
      color: var(--text-placeholder);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      height: var(--ctrl-md);
      padding: 0 12px 0 34px;
      background: var(--surface-primary);
      border: 1px solid var(--border-default);
      border-radius: var(--r-sm);
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
      transition: border-color var(--dur-base), box-shadow var(--dur-base);
    }

    .search-input::placeholder { color: var(--text-placeholder); }
    .search-input:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--border-focus-ring);
    }

    .select {
      height: var(--ctrl-md);
      padding: 0 30px 0 10px;
      background: var(--surface-primary);
      border: 1px solid var(--border-default);
      border-radius: var(--r-sm);
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      cursor: pointer;
      min-width: 140px;
      transition: border-color var(--dur-base);
    }

    .select:focus { border-color: var(--border-focus); box-shadow: 0 0 0 3px var(--border-focus-ring); }

    /* Grid */
    .centers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
      gap: 14px;
    }

    /* Card */
    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 18px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .center-avatar {
      width: 38px;
      height: 38px;
      border-radius: var(--r-md);
      background: var(--brand-subtle);
      color: var(--brand-text);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
      flex-shrink: 0;
      letter-spacing: 0.02em;
    }

    .card-header-info { flex: 1; min-width: 0; }

    .center-name {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .center-city {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .card-body { padding: 14px 18px; min-height: 52px; }

    .center-summary {
      color: var(--text-muted);
      font-size: 13px;
      margin: 0 0 10px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.5;
    }

    .syllabus-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .card-footer {
      display: flex;
      gap: 8px;
      padding: 12px 18px;
      border-top: 1px solid var(--border-subtle);
    }

    /* Utilities */
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
      const matchSearch = !this.search ||
        c.name.toLowerCase().includes(this.search.toLowerCase()) ||
        (c.city ?? '').toLowerCase().includes(this.search.toLowerCase());
      const matchStatus = !this.statusFilter || c.publication === this.statusFilter;
      return matchSearch && matchStatus;
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
