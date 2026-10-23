import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProvidersService } from './providers.service';
import { ProviderDoc } from '../../models/content/content.model';

interface Draft {
  status: string;
  plan: string;
  acceptingEnquiries: boolean;
  rating: number | null;
  reviewCount: number | null;
  initials: string;
  tags: string;
  locked: boolean;
  minStudents: number | null;
  interestedNow: number | null;
  details: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
}

@Component({
  selector: 'app-providers-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Tuition Centers</h1>
        <p>Public listing details shown in the learner app (providers collection).</p>
      </header>

      <div class="msg err" *ngIf="error()">{{ error() }}</div>
      <div class="msg ok" *ngIf="saved()">{{ saved() }}</div>
      <div *ngIf="loading()" class="muted">Loading…</div>

      <div class="layout">
        <aside class="list">
          <button *ngFor="let p of providers()" class="item" [class.active]="p.id === selectedId()" (click)="select(p)">
            <span class="avatar">{{ p.initials || (p.name || p.id).slice(0, 2).toUpperCase() }}</span>
            <span class="meta">
              <strong>{{ p.name || p.id }}</strong>
              <small>{{ p.status || 'no status' }} · {{ p.plan || 'no plan' }}</small>
            </span>
            <span class="status-dot" [class]="p.status || 'none'" title="{{ p.status || 'not set' }}"></span>
            <span class="lock" *ngIf="p.locked" title="Coming soon">🔒</span>
          </button>
          <p class="muted" *ngIf="!loading() && !providers().length">No providers found.</p>
        </aside>

        <form class="editor" *ngIf="draft() as d" (ngSubmit)="save()">
          <h2>{{ selected()?.name || selectedId() }}</h2>

          <section>
            <h3>Plan &amp; status</h3>
            <div class="row">
              <label>Listing status
                <select name="status" [(ngModel)]="d.status">
                  <option value="">Not set</option>
                  <option value="published">Published — visible to learners</option>
                  <option value="pending">Pending — hidden, awaiting review</option>
                  <option value="inactive">Inactive — removed from listing</option>
                </select>
              </label>
              <label>Plan
                <select name="plan" [(ngModel)]="d.plan">
                  <option value="">Not set</option>
                  <option value="scholo-basic">Scholo Basic</option>
                  <option value="scholo-premium">Scholo Premium</option>
                </select>
              </label>
            </div>
            <div class="row">
              <label class="check"><input type="checkbox" name="acceptingEnquiries" [(ngModel)]="d.acceptingEnquiries" /> Accepting enquiries</label>
              <label class="check"><input type="checkbox" name="locked" [(ngModel)]="d.locked" /> Locked — "coming soon"</label>
            </div>
          </section>

          <section>
            <h3>Listing</h3>
            <div class="row">
              <label>Rating <input type="number" step="0.1" min="0" max="5" name="rating" [(ngModel)]="d.rating" /></label>
              <label>Reviews <input type="number" min="0" name="reviewCount" [(ngModel)]="d.reviewCount" /></label>
              <label>Initials <input maxlength="3" name="initials" [(ngModel)]="d.initials" /></label>
            </div>
            <label>Tags <small>(comma separated)</small>
              <input name="tags" [(ngModel)]="d.tags" placeholder="CBSE, Maths, Online" />
            </label>
          </section>

          <section>
            <h3>Interest <small>(for locked centers)</small></h3>
            <div class="row">
              <label>Students needed <input type="number" min="0" name="min" [(ngModel)]="d.minStudents" /></label>
              <label>Interested now <input type="number" min="0" name="now" [(ngModel)]="d.interestedNow" /></label>
            </div>
            <label>Details <small>(one per line)</small>
              <textarea rows="3" name="details" [(ngModel)]="d.details"></textarea>
            </label>
          </section>

          <section>
            <h3>Syllabus SEO</h3>
            <label>Title <input name="seoTitle" [(ngModel)]="d.seoTitle" /></label>
            <label>Description <textarea rows="2" name="seoDescription" [(ngModel)]="d.seoDescription"></textarea></label>
            <label>Keywords <input name="seoKeywords" [(ngModel)]="d.seoKeywords" /></label>
          </section>

          <button class="btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save changes' }}</button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 1000px; margin: 0 auto; }
    h1 { margin: 0; font-size: 22px; color: #1e293b; }
    .page-header { margin-bottom: 18px; }
    .page-header p, .muted { color: #64748b; font-size: 14px; margin: 4px 0 0; }
    .msg { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
    .err { background: #fef2f2; color: #b91c1c; }
    .ok { background: #f0fdf4; color: #15803d; }
    .layout { display: grid; grid-template-columns: 260px 1fr; gap: 18px; align-items: start; }
    @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .item { display: flex; align-items: center; gap: 10px; background: #fff; border: 2px solid transparent; border-radius: 10px; padding: 10px; cursor: pointer; text-align: left; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
    .item.active { border-color: #3b82f6; }
    .avatar { width: 38px; height: 38px; border-radius: 10px; background: #3b82f6; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
    .meta { flex: 1; display: flex; flex-direction: column; }
    .meta small { color: #64748b; }
    .editor { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
    h2 { margin: 0 0 12px; font-size: 18px; }
    h3 { margin: 18px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
    h3 small { text-transform: none; letter-spacing: 0; font-weight: 400; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #334155; margin-bottom: 10px; flex: 1; min-width: 140px; }
    label small { color: #94a3b8; }
    label.check { flex-direction: row; align-items: center; gap: 8px; flex: none; }
    input:not([type=checkbox]), select, textarea { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
    .btn-primary { margin-top: 14px; background: #3b82f6; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .btn-primary:disabled { background: #cbd5e1; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: #cbd5e1; }
    .status-dot.published { background: #22c55e; }
    .status-dot.pending { background: #f59e0b; }
    .status-dot.inactive { background: #ef4444; }
  `],
})
export class ProvidersPageComponent implements OnInit {
  private service = inject(ProvidersService);

  providers = signal<ProviderDoc[]>([]);
  selectedId = signal('');
  selected = signal<ProviderDoc | null>(null);
  draft = signal<Draft | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal('');
  saved = signal('');

  async ngOnInit() {
    const res = await this.service.listProviders();
    if (!res.ok) this.error.set(`Couldn't load providers: ${res.message}`);
    this.providers.set(res.data ?? []);
    this.loading.set(false);
    if (res.data?.length) this.select(res.data[0]);
  }

  select(p: ProviderDoc) {
    this.saved.set('');
    this.selectedId.set(p.id);
    this.selected.set(p);
    this.draft.set({
      status: p.status ?? '',
      plan: p.plan ?? '',
      acceptingEnquiries: p.acceptingEnquiries === true,
      rating: p.rating ?? null,
      reviewCount: p.reviewCount ?? null,
      initials: p.initials ?? '',
      tags: (p.tags ?? []).join(', '),
      locked: p.locked === true,
      minStudents: p.interest?.minStudents ?? null,
      interestedNow: p.interest?.interestedNow ?? null,
      details: (p.interest?.details ?? []).join('\n'),
      seoTitle: p.syllabusSeo?.title ?? '',
      seoDescription: p.syllabusSeo?.description ?? '',
      seoKeywords: p.syllabusSeo?.keywords ?? '',
    });
  }

  async save() {
    const d = this.draft();
    const id = this.selectedId();
    if (!d || !id) return;
    this.saving.set(true);
    this.error.set('');
    this.saved.set('');

    const lines = d.details.split('\n').map(l => l.trim()).filter(Boolean);
    const tags = d.tags.split(',').map(t => t.trim()).filter(Boolean);
    const hasInterest = d.minStudents != null || d.interestedNow != null || lines.length > 0;
    const hasSeo = !!(d.seoTitle || d.seoDescription || d.seoKeywords);

    // null = remove the field, so "left blank" really means unset (these are optional, no defaults).
    const fields = {
      status: (d.status as ProviderDoc['status']) || null,
      plan: d.plan || null,
      acceptingEnquiries: d.acceptingEnquiries ? true : null,
      rating: d.rating ?? null,
      reviewCount: d.reviewCount ?? null,
      initials: d.initials.trim() || null,
      tags: tags.length ? tags : null,
      locked: d.locked ? true : null,
      interest: hasInterest
        ? { minStudents: d.minStudents ?? 0, interestedNow: d.interestedNow ?? 0, details: lines }
        : null,
      syllabusSeo: hasSeo
        ? { title: d.seoTitle, description: d.seoDescription, keywords: d.seoKeywords }
        : null,
    };

    const res = await this.service.saveProvider(id, fields);
    this.saving.set(false);
    if (!res.ok) {
      this.error.set(`Couldn't save: ${res.message}`);
      return;
    }
    this.saved.set('Saved.');
    const updated: ProviderDoc = {
      ...this.selected()!,
      status: (d.status as ProviderDoc['status']) || undefined,
      plan: (d.plan || undefined) as ProviderDoc['plan'],
      acceptingEnquiries: d.acceptingEnquiries || undefined,
      rating: d.rating ?? undefined,
      reviewCount: d.reviewCount ?? undefined,
      initials: d.initials.trim() || undefined,
      tags: tags.length ? tags : undefined,
      locked: d.locked || undefined,
      interest: fields.interest ?? undefined,
      syllabusSeo: fields.syllabusSeo ?? undefined,
    };
    this.selected.set(updated);
    this.providers.update(ps => ps.map(p => (p.id === id ? updated : p)));
  }
}
