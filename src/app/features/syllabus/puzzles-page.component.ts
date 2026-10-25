import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SyllabusService } from '../schedule/syllabus.service';
import { ClassPuzzles } from '../../models/syllabus/syllabus.model';

@Component({
  selector: 'app-puzzles-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1>Puzzles</h1>
    <p class="sub">Theory and multiple-choice puzzles per chapter, hosted with the syllabus.</p>

    <p class="error" *ngIf="error()">Couldn't load puzzles. Check your connection and reload.</p>

    <div class="toolbar" *ngIf="classIds().length">
      <label>Class
        <select [value]="classId()" (change)="selectClass($any($event.target).value)">
          <option *ngFor="let c of classIds()" [value]="c">{{ c }}</option>
        </select>
      </label>
    </div>
    <p *ngIf="loading()">Loading…</p>

    <ng-container *ngIf="data() as d">
      <p class="meta">{{ d.className }} · {{ d.board }} · {{ d.subject }} · {{ puzzleTotal() }} puzzles in {{ d.chapters.length }} chapters</p>
      <details class="chapter" *ngFor="let ch of d.chapters">
        <summary>
          <strong>{{ ch.chapterName }}</strong>
          <span class="count">{{ ch.puzzles.length }} puzzles</span>
        </summary>
        <div class="body">
          <ng-container *ngIf="ch.theory?.length">
            <h4>Theory</h4>
            <div *ngFor="let t of ch.theory">
              <strong>{{ t.title }}</strong>
              <ul><li *ngFor="let line of t.content">{{ line }}</li></ul>
            </div>
          </ng-container>
          <h4>Puzzles</h4>
          <div class="puzzle" *ngFor="let p of ch.puzzles; let n = index">
            <div class="q">{{ n + 1 }}. {{ p.question }}</div>
            <ol type="A">
              <li *ngFor="let o of p.options; let oi = index" [class.correct]="oi === p.correctIndex">
                {{ o }}
                <small>{{ p.explanations[oi] }}</small>
              </li>
            </ol>
          </div>
        </div>
      </details>
    </ng-container>
  `,
  styles: [`
    h1 { margin: 0 0 4px; color: var(--text-primary); }
    .sub, .meta { color: var(--text-muted); margin: 0 0 16px; }
    .error { color: var(--danger-color); }
    .toolbar { margin-bottom: 16px; color: var(--text-secondary); }
    select { margin-left: 8px; padding: 6px 10px; background: var(--surface-primary); border: 1px solid var(--border-default); border-radius: var(--r-sm); color: var(--text-primary); }
    .chapter { background: var(--surface-primary); border: 1px solid var(--border-default); border-radius: var(--r-md); margin-bottom: 8px; }
    summary { padding: 10px 14px; cursor: pointer; display: flex; gap: 10px; align-items: center; color: var(--text-primary); }
    .count { margin-left: auto; color: var(--text-muted); font-size: 12px; }
    .body { padding: 0 14px 12px; }
    h4 { margin: 12px 0 4px; font-size: 13px; color: var(--text-secondary); }
    ul { margin: 2px 0 8px; padding-left: 20px; }
    .puzzle { border-top: 1px solid var(--border-default); padding: 10px 0; }
    .q { font-weight: 600; color: var(--text-primary); }
    ol { margin: 6px 0 0; padding-left: 24px; color: var(--text-secondary); }
    li small { display: block; color: var(--text-muted); }
    li.correct { color: var(--success-color); font-weight: 600; }
    li.correct small { color: var(--success-color); font-weight: 400; }
  `],
})
export class PuzzlesPageComponent implements OnInit {
  private service = inject(SyllabusService);

  classIds = signal<string[]>([]);
  classId = signal('');
  data = signal<ClassPuzzles | null>(null);
  loading = signal(false);
  error = signal(false);
  puzzleTotal = computed(() => this.data()?.chapters.reduce((n, c) => n + c.puzzles.length, 0) ?? 0);

  async ngOnInit() {
    try {
      const ids = await this.service.listPuzzleClassIds();
      this.classIds.set(ids);
      if (ids.length) await this.selectClass(ids[0]);
    } catch {
      this.error.set(true);
    }
  }

  async selectClass(id: string) {
    this.classId.set(id);
    this.loading.set(true);
    try {
      this.data.set(await this.service.loadPuzzles(id));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
