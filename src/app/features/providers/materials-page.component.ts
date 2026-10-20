import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ProvidersService } from './providers.service';
import { SyllabusService } from '../schedule/syllabus.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { ClassDoc, MaterialDoc } from '../../models/content/content.model';
import { Chapter } from '../../models/syllabus/syllabus.model';

@Component({
  selector: 'app-materials-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Class Materials</h1>
        <p>Notes and files students see for each chapter.</p>
      </header>

      <div class="msg warn" *ngIf="!canEdit()">🔒 View only — editing needs the "can edit content" permission.</div>
      <div class="msg err" *ngIf="error()">{{ error() }}</div>

      <label class="picker">Class
        <select [ngModel]="classId()" (ngModelChange)="selectClass($event)">
          <option value="">Select a class…</option>
          <option *ngFor="let c of classes()" [value]="c.id">{{ c.name || c.className || c.title || c.id }}</option>
        </select>
      </label>

      <ng-container *ngIf="classId()">
        <form class="form" *ngIf="canEdit()" (ngSubmit)="save()">
          <h3>{{ editingId() ? 'Edit material' : 'Add material' }}</h3>
          <div class="row">
            <label>Title <input name="title" [(ngModel)]="title" required /></label>
            <label>Chapter
              <select *ngIf="chapters().length; else freeChapter" name="chapter" [(ngModel)]="chapterId" required>
                <option value="">Select…</option>
                <option *ngFor="let ch of chapters()" [value]="ch.code">{{ ch.name }}</option>
              </select>
              <ng-template #freeChapter><input name="chapterFree" [(ngModel)]="chapterId" required placeholder="Chapter id" /></ng-template>
            </label>
          </div>
          <label>File URL <small>(Cloudflare R2 link)</small>
            <input name="fileUrl" [(ngModel)]="fileUrl" required placeholder="https://…" />
          </label>
          <div class="btns">
            <button class="btn-primary" type="submit" [disabled]="saving() || !valid()">{{ saving() ? 'Saving…' : editingId() ? 'Update' : 'Add material' }}</button>
            <button class="btn-ghost" type="button" *ngIf="editingId()" (click)="reset()">Cancel</button>
          </div>
        </form>

        <div *ngIf="loading()" class="muted">Loading…</div>
        <div class="card" *ngFor="let m of materials()">
          <div class="info">
            <strong>{{ m.title }}</strong>
            <small>{{ chapterName(m.chapterId) }}</small>
            <a [href]="m.fileUrl" target="_blank" rel="noopener">{{ m.fileUrl }}</a>
          </div>
          <div class="btns" *ngIf="canEdit()">
            <button class="btn-ghost" (click)="edit(m)">Edit</button>
            <button class="btn-danger" (click)="remove(m)">Delete</button>
          </div>
        </div>
        <p class="muted" *ngIf="!loading() && !materials().length">No materials yet.</p>
      </ng-container>
    </div>
  `,
  styles: [`
    .page { max-width: 900px; margin: 0 auto; }
    h1 { margin: 0; font-size: 22px; color: #1e293b; }
    .page-header { margin-bottom: 18px; }
    .page-header p, .muted { color: #64748b; font-size: 14px; margin: 4px 0 0; }
    .msg { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
    .err { background: #fef2f2; color: #b91c1c; }
    .warn { background: #fffbeb; color: #92400e; }
    .picker { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #334155; max-width: 360px; margin-bottom: 16px; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #334155; margin-bottom: 10px; flex: 1; }
    label small { color: #94a3b8; }
    input, select { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
    .form { background: #fff; border-radius: 12px; padding: 16px 18px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
    h3 { margin: 0 0 10px; font-size: 15px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .row label { min-width: 200px; }
    .btns { display: flex; gap: 8px; }
    .btn-primary { background: #3b82f6; color: #fff; border: none; padding: 9px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .btn-primary:disabled { background: #cbd5e1; }
    .btn-ghost { background: #fff; border: 1px solid #cbd5e1; padding: 8px 14px; border-radius: 8px; cursor: pointer; }
    .btn-danger { background: #fff; border: 1px solid #fecaca; color: #b91c1c; padding: 8px 14px; border-radius: 8px; cursor: pointer; }
    .card { background: #fff; border-radius: 10px; padding: 12px 16px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
    .info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .info small { color: #64748b; }
    .info a { color: #3b82f6; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `],
})
export class MaterialsPageComponent implements OnInit {
  private service = inject(ProvidersService);
  private syllabus = inject(SyllabusService);
  private route = inject(ActivatedRoute);
  private auth = inject(AdminAuthService);

  canEdit = computed(() => this.auth.isAdmin() || this.auth.userProfile()?.canEditContent === true);

  classes = signal<ClassDoc[]>([]);
  classId = signal('');
  chapters = signal<Chapter[]>([]);
  materials = signal<MaterialDoc[]>([]);
  loading = signal(false);
  saving = signal(false);
  error = signal('');
  editingId = signal('');

  title = '';
  chapterId = '';
  fileUrl = '';

  async ngOnInit() {
    const res = await this.service.listClasses();
    if (!res.ok) this.error.set(`Couldn't load classes: ${res.message}`);
    this.classes.set(res.data ?? []);
    const initial = this.route.snapshot.queryParamMap.get('classId');
    if (initial) await this.selectClass(initial);
  }

  async selectClass(id: string) {
    this.classId.set(id);
    this.reset();
    this.materials.set([]);
    this.chapters.set([]);
    if (!id) return;
    this.loading.set(true);
    const [mats, syl] = await Promise.all([
      this.service.listMaterials(id),
      this.syllabus.loadClass(id).catch(() => null),
    ]);
    if (!mats.ok) this.error.set(`Couldn't load materials: ${mats.message}`);
    this.materials.set(mats.data ?? []);
    this.chapters.set(syl?.subjects.flatMap(s => s.chapters) ?? []);
    this.loading.set(false);
  }

  valid() { return !!(this.title.trim() && this.chapterId && this.fileUrl.trim()); }

  chapterName(id: string) { return this.chapters().find(c => c.code === id)?.name ?? id; }

  edit(m: MaterialDoc) {
    this.editingId.set(m.id);
    this.title = m.title;
    this.chapterId = m.chapterId;
    this.fileUrl = m.fileUrl;
  }

  reset() {
    this.editingId.set('');
    this.title = '';
    this.chapterId = '';
    this.fileUrl = '';
  }

  async save() {
    if (!this.valid()) return;
    this.error.set('');
    this.saving.set(true);
    const id = this.editingId() || this.service.newMaterialId();
    const doc = { id, title: this.title.trim(), chapterId: this.chapterId, fileUrl: this.fileUrl.trim() };
    const res = await this.service.saveMaterial(this.classId(), doc);
    this.saving.set(false);
    if (!res.ok) {
      this.error.set(`Couldn't save: ${res.message}`);
      return;
    }
    this.materials.update(ms => (ms.some(m => m.id === id) ? ms.map(m => (m.id === id ? { ...m, ...doc } : m)) : [...ms, doc]));
    this.reset();
  }

  async remove(m: MaterialDoc) {
    if (!confirm(`Delete "${m.title}"? Students will no longer see it.`)) return;
    const res = await this.service.deleteMaterial(this.classId(), m.id);
    if (!res.ok) {
      this.error.set(`Couldn't delete: ${res.message}`);
      return;
    }
    this.materials.update(ms => ms.filter(x => x.id !== m.id));
  }
}
