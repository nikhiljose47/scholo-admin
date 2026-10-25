import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SyllabusService } from '../schedule/syllabus.service';
import { ClassSyllabus, SyllabusIndexEntry, Subject } from '../../models/syllabus/syllabus.model';

type ClassEntry = SyllabusIndexEntry & { enabled: boolean };

@Component({
  selector: 'app-syllabus-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Syllabus</h1>
    <p class="sub">All classes from the hosted syllabus catalog (content.scholo.co.in).</p>

    <p class="error" *ngIf="error()">Couldn't load the syllabus. Check your connection and reload.</p>

    <div class="toolbar" *ngIf="classes().length">
      <label class="class-label">Class
        <select [value]="classId()" (change)="selectClass($any($event.target).value)">
          <option *ngFor="let c of classes()" [value]="c.classId">
            {{ c.className }}{{ c.enabled ? '' : ' (disabled)' }}
          </option>
        </select>
      </label>
      <label class="filter-label">
        <input
          type="search"
          placeholder="Filter chapters…"
          [value]="filterText()"
          (input)="filterText.set($any($event.target).value)"
        />
      </label>
    </div>
    <p *ngIf="loading()">Loading…</p>

    <ng-container *ngIf="syllabus() as s">
      <p class="meta">
        {{ s.className }}
        <span class="badge badge-warn" *ngIf="!currentClass()?.enabled">disabled in catalog</span>
        · {{ s.syllabus_year }} · {{ chapterTotal() }} chapters
      </p>

      <section class="subject" *ngFor="let sub of filteredSubjects()">
        <h2>
          <span class="subject-code">{{ sub.code }}</span>
          {{ sub.name }}
          <span class="badge" *ngIf="sub.enabled === false">disabled</span>
        </h2>

        <details class="chapter" *ngFor="let ch of sub.chapters; let i = index">
          <summary>
            <code class="ch-code">{{ ch.code }}</code>
            <strong>{{ ch.name }}</strong>
            <span class="badge" *ngIf="ch.enabled === false">disabled</span>
            <span class="count">{{ ch.divisions?.length || 0 }} div</span>
          </summary>
          <div class="body">
            <ng-container *ngIf="ch.agenda?.length">
              <h4>Agenda</h4>
              <ul><li *ngFor="let a of ch.agenda">{{ a }}</li></ul>
            </ng-container>
            <ng-container *ngIf="ch.session_instructions?.length">
              <h4>Session instructions</h4>
              <ul><li *ngFor="let x of ch.session_instructions"><em>{{ x.type }}:</em> {{ x.text }}</li></ul>
            </ng-container>
            <ng-container *ngIf="ch.teacher_aids?.length">
              <h4>Teacher aids</h4>
              <ul><li *ngFor="let a of ch.teacher_aids">{{ a }}</li></ul>
            </ng-container>
            <ng-container *ngIf="ch.divisions?.length">
              <h4>Divisions</h4>
              <table>
                <tr><th>Code</th><th>Name</th><th>Level</th><th>Min</th></tr>
                <tr *ngFor="let d of ch.divisions">
                  <td>{{ d.code }}</td><td>{{ d.name }}</td><td>{{ d.difficulty_level }}</td><td>{{ d.time_estimate_min }}</td>
                </tr>
              </table>
            </ng-container>
          </div>
        </details>

        <p class="no-match" *ngIf="sub.chapters.length === 0">No chapters match "{{ filterText() }}"</p>
      </section>

      <p class="no-match" *ngIf="!filteredSubjects().length && filterText()">
        No chapters match "{{ filterText() }}"
      </p>
    </ng-container>
  `,
  styles: [`
    h1 { margin: 0 0 4px; color: var(--text-primary); }
    .sub, .meta { color: var(--text-muted); margin: 0 0 16px; }
    .error { color: var(--danger-color); }
    .toolbar { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 16px; }
    .class-label, .filter-label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-secondary); font-weight: 500; }
    select { padding: 6px 10px; background: var(--surface-primary); border: 1px solid var(--border-default); border-radius: var(--r-sm); color: var(--text-primary); font: inherit; }
    input[type=search] { padding: 6px 10px; background: var(--surface-primary); border: 1px solid var(--border-default); border-radius: var(--r-sm); color: var(--text-primary); font: inherit; min-width: 200px; }

    .subject h2 { font-size: 17px; margin: 20px 0 8px; display: flex; align-items: center; gap: 8px; color: var(--text-primary); }
    .subject-code { font-size: 11px; font-weight: 600; background: var(--surface-secondary); color: var(--text-muted); padding: 2px 6px; border-radius: var(--r-xs); letter-spacing: .04em; }

    .chapter { background: var(--surface-primary); border: 1px solid var(--border-default); border-radius: var(--r-md); margin-bottom: 8px; }
    summary { padding: 10px 14px; cursor: pointer; display: flex; gap: 8px; align-items: center; color: var(--text-primary); }
    .ch-code { font-size: 11px; background: var(--surface-secondary); border: 1px solid var(--border-default); color: var(--text-muted); padding: 1px 6px; border-radius: var(--r-xs); white-space: nowrap; font-family: var(--font-mono); }
    .count { margin-left: auto; color: var(--text-muted); font-size: 12px; white-space: nowrap; }

    .body { padding: 0 14px 12px; }
    h4 { margin: 12px 0 4px; font-size: 13px; color: var(--text-secondary); }
    ul { margin: 0; padding-left: 20px; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; color: var(--text-secondary); }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--border-default); }

    .badge { background: var(--danger-bg); color: var(--danger-text); font-size: 11px; padding: 1px 6px; border-radius: var(--r-full); white-space: nowrap; }
    .badge-warn { background: var(--warning-bg); color: var(--warning-text); }

    .no-match { font-size: 13px; color: var(--text-placeholder); padding: 6px 0; }
  `],
})
export class SyllabusPageComponent implements OnInit {
  private service = inject(SyllabusService);

  classes = signal<ClassEntry[]>([]);
  classId = signal('');
  syllabus = signal<ClassSyllabus | null>(null);
  filterText = signal('');
  loading = signal(false);
  error = signal(false);

  currentClass = computed(() => this.classes().find(c => c.classId === this.classId()) ?? null);

  chapterTotal = computed(() => this.syllabus()?.subjects.reduce((n, s) => n + s.chapters.length, 0) ?? 0);

  filteredSubjects = computed((): Subject[] => {
    const s = this.syllabus();
    if (!s) return [];
    const q = this.filterText().toLowerCase().trim();
    if (!q) return s.subjects;
    return s.subjects
      .map(sub => ({
        ...sub,
        chapters: sub.chapters.filter(
          ch => ch.name.toLowerCase().includes(q) || ch.code.toLowerCase().includes(q),
        ),
      }))
      .filter(sub => sub.chapters.length > 0);
  });

  async ngOnInit() {
    try {
      const classes = await this.service.listAllClasses();
      this.classes.set(classes);
      if (classes.length) await this.selectClass(classes[0].classId);
    } catch {
      this.error.set(true);
    }
  }

  async selectClass(id: string) {
    this.filterText.set('');
    this.classId.set(id);
    this.loading.set(true);
    try {
      this.syllabus.set(await this.service.loadAnyClass(id));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
