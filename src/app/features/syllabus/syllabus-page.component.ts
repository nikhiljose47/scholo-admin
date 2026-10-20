import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SyllabusService } from '../schedule/syllabus.service';
import { ClassSyllabus, SyllabusIndexEntry } from '../../models/syllabus/syllabus.model';

@Component({
  selector: 'app-syllabus-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Syllabus</h1>
    <p class="sub">Enabled classes from the hosted syllabus catalog (content.scholo.co.in).</p>

    <p class="error" *ngIf="error()">Couldn't load the syllabus. Check your connection and reload.</p>

    <div class="toolbar" *ngIf="classes().length">
      <label>Class
        <select [value]="classId()" (change)="selectClass($any($event.target).value)">
          <option *ngFor="let c of classes()" [value]="c.classId">{{ c.className }}</option>
        </select>
      </label>
    </div>
    <p *ngIf="loading()">Loading…</p>

    <ng-container *ngIf="syllabus() as s">
      <p class="meta">{{ s.className }} · {{ s.syllabus_year }} · {{ chapterTotal() }} chapters</p>
      <section class="subject" *ngFor="let sub of s.subjects">
        <h2>{{ sub.name }} <span class="badge" *ngIf="sub.enabled === false">disabled</span></h2>
        <details class="chapter" *ngFor="let ch of sub.chapters; let i = index">
          <summary>
            <strong>{{ i + 1 }}. {{ ch.name }}</strong>
            <span class="badge" *ngIf="ch.enabled === false">disabled</span>
            <span class="count">{{ ch.divisions?.length || 0 }} divisions</span>
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
                <tr><th>Code</th><th>Name</th><th>Level</th><th>Minutes</th></tr>
                <tr *ngFor="let d of ch.divisions">
                  <td>{{ d.code }}</td><td>{{ d.name }}</td><td>{{ d.difficulty_level }}</td><td>{{ d.time_estimate_min }}</td>
                </tr>
              </table>
            </ng-container>
          </div>
        </details>
      </section>
    </ng-container>
  `,
  styles: [`
    h1 { margin: 0 0 4px; }
    .sub, .meta { color: #64748b; margin: 0 0 16px; }
    .error { color: #dc2626; }
    .toolbar { margin-bottom: 16px; }
    select { margin-left: 8px; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; }
    .subject h2 { font-size: 18px; margin: 20px 0 8px; }
    .chapter { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; }
    summary { padding: 10px 14px; cursor: pointer; display: flex; gap: 10px; align-items: center; }
    .count { margin-left: auto; color: #64748b; font-size: 12px; }
    .body { padding: 0 14px 12px; }
    h4 { margin: 12px 0 4px; font-size: 13px; color: #334155; }
    ul { margin: 0; padding-left: 20px; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
    .badge { background: #fee2e2; color: #b91c1c; font-size: 11px; padding: 1px 6px; border-radius: 10px; }
  `],
})
export class SyllabusPageComponent implements OnInit {
  private service = inject(SyllabusService);

  classes = signal<SyllabusIndexEntry[]>([]);
  classId = signal('');
  syllabus = signal<ClassSyllabus | null>(null);
  loading = signal(false);
  error = signal(false);
  chapterTotal = computed(() => this.syllabus()?.subjects.reduce((n, s) => n + s.chapters.length, 0) ?? 0);

  async ngOnInit() {
    try {
      const classes = await this.service.listClasses();
      this.classes.set(classes);
      if (classes.length) await this.selectClass(classes[0].classId);
    } catch {
      this.error.set(true);
    }
  }

  async selectClass(id: string) {
    this.classId.set(id);
    this.loading.set(true);
    try {
      this.syllabus.set(await this.service.loadClass(id));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
