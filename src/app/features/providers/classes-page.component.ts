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
    h1 { margin: 0; font-size: 22px; color: #1e293b; }
    .page-header { margin-bottom: 18px; }
    .page-header p, .muted { color: #64748b; font-size: 14px; margin: 4px 0 0; }
    .msg { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
    .err { background: #fef2f2; color: #b91c1c; }
    .card { background: #fff; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
    .info { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 2px; }
    .doc-id { color: #94a3b8; font-size: 11px; font-family: monospace; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #64748b; }
    select { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; min-width: 200px; }
    .state { font-size: 12px; color: #64748b; }
    .state.ok { color: #15803d; }
    .link { color: #3b82f6; font-size: 13px; text-decoration: none; font-weight: 600; }
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
