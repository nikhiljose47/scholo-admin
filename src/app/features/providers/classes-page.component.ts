import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProvidersService } from './providers.service';
import { SyllabusService } from '../schedule/syllabus.service';
import { ClassDoc, ProviderDoc } from '../../models/content/content.model';
import { SyllabusIndexEntry } from '../../models/syllabus/syllabus.model';

type CatalogEntry = SyllabusIndexEntry & { enabled: boolean };

@Component({
  selector: 'app-classes-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Classes</h1>
        <p>Link each class to its tuition center and syllabus.</p>
      </header>

      <div class="msg err" *ngIf="error()">{{ error() }}</div>
      <div *ngIf="loading()" class="muted">Loading…</div>

      <div class="card" *ngFor="let c of classes()">
        <div class="info">
          <strong>{{ c.name || c.className || c.title || c.id }}</strong>
          <small class="doc-id">{{ c.id }}</small>
        </div>

        <!-- Tuition center picker -->
        <label>Tuition center
          <select [value]="c.providerId ?? ''" [disabled]="saving() === c.id" (change)="setProvider(c, $any($event.target).value)">
            <option value="">— Not linked —</option>
            <option *ngFor="let p of providers()" [value]="p.id">{{ p.name || p.id }}</option>
          </select>
        </label>

        <!-- Syllabus class picker -->
        <label>Syllabus class
          <select [value]="c.classId ?? ''" [disabled]="saving() === c.id" (change)="setSyllabus(c, $any($event.target).value)">
            <option value="">— Not set —</option>
            <option *ngFor="let s of catalog()" [value]="s.classId">
              {{ s.className }}{{ s.enabled ? '' : ' (disabled)' }}
            </option>
          </select>
        </label>

        <span class="state" *ngIf="saving() === c.id">Saving…</span>
        <span class="state ok" *ngIf="justSaved() === c.id">✓ Saved</span>
        <a [routerLink]="['/materials']" [queryParams]="{ classId: c.id }" class="link">Materials →</a>
      </div>
      <p class="muted" *ngIf="!loading() && !classes().length">No classes found.</p>
    </div>
  `,
  styles: [`
    .page { max-width: 900px; margin: 0 auto; }
    h1 { margin: 0; font-size: 22px; color: var(--text-primary); }
    .page-header { margin-bottom: 20px; }
    .page-header p, .muted { color: var(--text-muted); font-size: 14px; margin: 4px 0 0; }
    .msg { padding: 10px 14px; border-radius: var(--r-md); font-size: 13px; margin-bottom: 12px; }
    .err { background: var(--danger-bg); color: var(--danger-text); }
    .card { background: var(--surface-primary); border: 1px solid var(--border-subtle); border-radius: var(--r-lg); padding: 14px 16px; margin-bottom: 10px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; box-shadow: var(--shadow-sm); }
    .info { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 2px; }
    .doc-id { color: var(--text-placeholder); font-size: 11px; font-family: var(--font-mono); }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-muted); }
    select { padding: 8px 10px; background: var(--surface-primary); border: 1px solid var(--border-default); border-radius: var(--r-md); color: var(--text-primary); font: inherit; min-width: 200px; }
    .state { font-size: 12px; color: var(--text-muted); }
    .state.ok { color: var(--success-color); }
    .link { color: var(--text-link); font-size: 13px; text-decoration: none; font-weight: 600; }
  `],
})
export class ClassesPageComponent implements OnInit {
  private service = inject(ProvidersService);
  private syllabusService = inject(SyllabusService);

  classes = signal<ClassDoc[]>([]);
  providers = signal<ProviderDoc[]>([]);
  catalog = signal<CatalogEntry[]>([]);
  loading = signal(true);
  saving = signal('');
  justSaved = signal('');
  error = signal('');

  async ngOnInit() {
    const [cls, prov, cat] = await Promise.all([
      this.service.listClasses(),
      this.service.listProviders(),
      this.syllabusService.listAllClasses(),
    ]);
    if (!cls.ok) this.error.set(`Couldn't load classes: ${cls.message}`);
    this.classes.set(cls.data ?? []);
    this.providers.set(prov.data ?? []);
    this.catalog.set(cat);
    this.loading.set(false);
  }

  async setProvider(c: ClassDoc, providerId: string) {
    this.error.set('');
    this.justSaved.set('');
    this.saving.set(c.id);
    const res = await this.service.setClassProvider(c.id, providerId || null);
    this.saving.set('');
    if (!res.ok) {
      this.error.set(`Couldn't update ${c.id}: ${res.message}`);
      this.classes.update(cs => [...cs]);
      return;
    }
    this.classes.update(cs => cs.map(x => (x.id === c.id ? { ...x, providerId: providerId || undefined } : x)));
    this.justSaved.set(c.id);
  }

  async setSyllabus(c: ClassDoc, syllabusClassId: string) {
    this.error.set('');
    this.justSaved.set('');
    this.saving.set(c.id);
    const res = await this.service.setClassSyllabus(c.id, syllabusClassId || null);
    this.saving.set('');
    if (!res.ok) {
      this.error.set(`Couldn't update ${c.id}: ${res.message}`);
      this.classes.update(cs => [...cs]);
      return;
    }
    this.classes.update(cs => cs.map(x => (x.id === c.id ? { ...x, classId: syllabusClassId || undefined } : x)));
    this.justSaved.set(c.id);
  }
}
