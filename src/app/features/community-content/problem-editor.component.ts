import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DiagramComponent } from '../../shared/components/diagram/diagram.component';
import { SafeMarkdownPipe } from '../../shared/pipes/safe-markdown.pipe';
import { COMMUNITY_TOPICS, sectionsForTopic } from './community.models';
import { LIMITS, PROBLEM_DIFFICULTIES, PROBLEM_TYPES } from '../../models/community-contracts/problem-library';
import type { DraftFields } from '../../models/community-contracts/problem-draft';
import {
  AdminApiError,
  CommunityContentAdminService,
  type DraftDto,
  type DraftPreview,
  type FieldError,
} from './community-content-admin.service';
import { ProblemLibraryService } from './problem-library.service';
import type { PublicMedia } from '../../models/community-contracts/media';

const LICENSES = ['Scholo original', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'public-domain'];
const TYPE_LABEL: Record<string, string> = { mcq: 'Multiple choice', short_answer: 'Short answer', worked_solution: 'Worked solution' };
type Format = 'markdown' | 'latex' | 'text';
interface OptionRow { id: string; text: string; explanation: string }

const newKey = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * One editor for every route into a problem: a new one, a saved draft, a live problem opened for revision, and an
 * imported record. It edits a private working copy and only ever sends what the person typed; identity, revision
 * numbers, visibility and storage keys belong to the server. Saving is manual (no autosave), and publishing needs
 * a saved copy that passes the server's checks plus an explicit confirmation.
 */
@Component({
  selector: 'app-problem-editor',
  standalone: true,
  imports: [SafeMarkdownPipe, DiagramComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './problem-editor.component.html',
  styleUrl: './problem-editor.component.scss',
})
export class ProblemEditorComponent {
  private readonly admin = inject(CommunityContentAdminService);
  private readonly library = inject(ProblemLibraryService);

  readonly topicId = input.required<string>();
  /** Null starts a new problem; an id opens that working copy. */
  readonly draftId = input<string | null>(null);
  readonly dirtyChange = output<boolean>();
  readonly saved = output<DraftDto>();
  readonly published = output<{ id: string; publicPath: string | null }>();
  readonly closed = output<void>();

  readonly types = PROBLEM_TYPES;
  readonly typeLabel = TYPE_LABEL;
  readonly difficulties = PROBLEM_DIFFICULTIES;
  readonly licenses = LICENSES;
  readonly limits = LIMITS;
  readonly concepts = computed(() => COMMUNITY_TOPICS.find((t) => t.id === this.topicId())?.concepts ?? []);
  readonly sections = computed(() => sectionsForTopic(this.topicId()));

  // ----- form state -----
  readonly title = signal('');
  readonly slug = signal('');
  readonly type = signal<string>('short_answer');
  readonly difficulty = signal('');
  readonly conceptSlugs = signal<string[]>([]);
  readonly sectionId = signal('');
  readonly tags = signal('');
  readonly statement = signal('');
  readonly answer = signal('');
  readonly explanation = signal('');
  readonly options = signal<OptionRow[]>([]);
  readonly correct = signal<string[]>([]);
  readonly diagramsJson = signal('');
  readonly mediaIds = signal('');
  readonly sourceType = signal('');
  readonly license = signal('');
  readonly attribution = signal('');
  readonly seoEligible = signal(false);
  private formats = { statement: 'markdown' as Format, answer: 'markdown' as Format, explanation: 'markdown' as Format };

  // ----- server state -----
  readonly currentId = signal<string | null>(null);
  readonly revision = signal(0);
  readonly draft = signal<DraftDto | null>(null);
  readonly saving = signal(false);
  readonly loading = signal(false);
  readonly banner = signal<{ kind: 'ok' | 'error'; text: string; link?: string } | null>(null);
  readonly conflict = signal(false);
  readonly fieldErrors = signal<Record<string, string[]>>({});
  readonly preview = signal<DraftPreview | null>(null);
  readonly confirming = signal(false);
  readonly reviewed = signal(false);
  readonly publishing = signal(false);
  private readonly savedSnapshot = signal('');
  private createKey = newKey();

  /** Fields in the shape the API accepts, or the local problems that stop it being built. */
  private readonly built = computed<{ fields: Partial<DraftFields>; local: Record<string, string> }>(() => {
    const local: Record<string, string> = {};
    let diagrams: unknown[] = [];
    const raw = this.diagramsJson().trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        diagrams = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        local['diagrams'] = 'The diagram is not valid JSON. Paste a DiagramSpec object (or an array of them).';
      }
    }
    const isMcq = this.type() === 'mcq';
    const rows = this.options().filter((o) => o.text.trim() !== '');
    const correctIds = rows.map((o) => o.id).filter((id) => this.correct().includes(id));
    const answerText = isMcq ? correctIds.join(',') : this.answer();
    const source = this.sourceType()
      ? { type: this.sourceType() as 'original' | 'licensed' | 'permission', license: this.license(), attribution: this.attribution().trim() || null }
      : null;
    const fields = {
      title: this.title(),
      slug: this.slug().trim() || null,
      type: this.type() as DraftFields['type'],
      difficulty: (this.difficulty() || null) as DraftFields['difficulty'],
      conceptSlugs: this.conceptSlugs(),
      ...(this.sectionId() ? { sectionId: this.sectionId() } : {}),
      tags: this.tags().split(',').map((t) => t.trim()).filter(Boolean),
      statement: { format: this.formats.statement, text: this.statement() },
      answer: answerText.trim() ? { format: (isMcq ? 'text' : this.formats.answer) as Format, text: answerText } : null,
      explanation: this.explanation().trim() ? { format: this.formats.explanation, text: this.explanation() } : null,
      options: isMcq ? rows.map((o) => ({ id: o.id, text: o.text, ...(o.explanation.trim() ? { explanation: o.explanation } : {}) })) : null,
      diagrams,
      media: this.mediaIds().split(/[\s,|]+/).filter(Boolean),
      source,
      seoEligible: this.seoEligible(),
    } as Partial<DraftFields>;
    return { fields, local };
  });

  readonly dirty = computed(() => JSON.stringify(this.built().fields) !== this.savedSnapshot());
  readonly canPublish = computed(() => !!this.currentId() && !this.dirty() && !this.saving() && !this.loading() && !!this.draft()?.readiness.publishable);
  readonly stateLabel = computed(() => {
    const d = this.draft();
    if (this.dirty()) return 'Unsaved changes';
    if (!d) return 'New problem (not saved yet)';
    return d.state === 'live' ? 'Published; no pending changes' : d.kind === 'revision' ? 'Private revision of a published problem' : 'Draft (private)';
  });

  constructor() {
    effect(() => {
      const id = this.draftId();
      const topic = this.topicId();
      untracked(() => void this.open(topic, id));
    });
    effect(() => this.dirtyChange.emit(this.dirty()));

    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const warn = (event: BeforeUnloadEvent): void => {
        if (!untracked(() => this.dirty())) return;
        event.preventDefault();
        event.returnValue = '';
      };
      window.addEventListener('beforeunload', warn);
      inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', warn));
    }
  }

  /** True while there is something the person has typed that is not saved. */
  hasUnsavedChanges(): boolean {
    return this.dirty();
  }

  // ---------------- loading ----------------

  private async open(topicId: string, id: string | null): Promise<void> {
    this.banner.set(null);
    this.conflict.set(false);
    this.fieldErrors.set({});
    this.preview.set(null);
    this.confirming.set(false);
    this.currentId.set(id);
    if (!id) {
      this.draft.set(null);
      this.revision.set(0);
      this.createKey = newKey();
      this.reset();
      return;
    }
    this.loading.set(true);
    try {
      this.apply(await this.admin.getDraft(topicId, id));
    } catch (error) {
      this.fail(error);
    } finally {
      this.loading.set(false);
    }
  }

  private reset(): void {
    this.title.set(''); this.slug.set(''); this.type.set('short_answer'); this.difficulty.set(''); this.conceptSlugs.set([]); this.sectionId.set('');
    this.tags.set(''); this.statement.set(''); this.answer.set(''); this.explanation.set(''); this.options.set([]); this.correct.set([]);
    this.diagramsJson.set(''); this.mediaIds.set(''); this.sourceType.set('original'); this.license.set('Scholo original'); this.attribution.set('');
    this.seoEligible.set(false);
    this.formats = { statement: 'markdown', answer: 'markdown', explanation: 'markdown' };
    this.savedSnapshot.set(JSON.stringify(this.built().fields));
  }

  private apply(d: DraftDto): void {
    const f = d.fields;
    this.draft.set(d);
    this.currentId.set(d.id);
    this.revision.set(d.revision);
    this.title.set(f.title); this.slug.set(f.slug ?? ''); this.type.set(f.type); this.difficulty.set(f.difficulty ?? '');
    this.conceptSlugs.set([...f.conceptSlugs]); this.sectionId.set(f.sectionId ?? ''); this.tags.set(f.tags.join(', '));
    this.statement.set(f.statement.text); this.answer.set(f.type === 'mcq' ? '' : (f.answer?.text ?? '')); this.explanation.set(f.explanation?.text ?? '');
    this.options.set((f.options ?? []).map((o) => ({ id: o.id, text: o.text, explanation: o.explanation ?? '' })));
    this.correct.set(f.type === 'mcq' && f.answer ? f.answer.text.split(',').map((s) => s.trim()).filter(Boolean) : []);
    this.diagramsJson.set(f.diagrams.length ? JSON.stringify(f.diagrams.length === 1 ? f.diagrams[0] : f.diagrams, null, 2) : '');
    this.mediaIds.set(f.media.join(', '));
    this.sourceType.set(f.source?.type ?? ''); this.license.set(f.source?.license ?? ''); this.attribution.set(f.source?.attribution ?? '');
    this.seoEligible.set(f.seoEligible);
    this.formats = { statement: f.statement.format, answer: f.answer?.format ?? 'markdown', explanation: f.explanation?.format ?? 'markdown' };
    this.savedSnapshot.set(JSON.stringify(this.built().fields));
  }

  // ---------------- editing helpers ----------------

  setType(value: string): void {
    this.type.set(value);
    if (value === 'mcq' && this.options().length === 0) this.options.set([this.blankOption('a'), this.blankOption('b')]);
  }

  toggleConcept(slug: string, on: boolean): void {
    this.conceptSlugs.update((list) => (on ? (list.includes(slug) ? list : [...list, slug]) : list.filter((s) => s !== slug)));
  }

  addOption(): void {
    const used = new Set(this.options().map((o) => o.id));
    const id = 'abcdefgh'.split('').find((c) => !used.has(c));
    if (id) this.options.update((list) => [...list, this.blankOption(id)]);
  }

  removeOption(id: string): void {
    this.options.update((list) => list.filter((o) => o.id !== id));
    this.correct.update((list) => list.filter((c) => c !== id));
  }

  setOption(id: string, patch: Partial<OptionRow>): void {
    this.options.update((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  toggleCorrect(id: string, on: boolean): void {
    this.correct.update((list) => (on ? (list.includes(id) ? list : [...list, id]) : list.filter((c) => c !== id)));
  }

  private blankOption(id: string): OptionRow {
    return { id, text: '', explanation: '' };
  }

  errorsFor(field: string): string[] {
    return this.fieldErrors()[field] ?? [];
  }

  // ---------------- actions ----------------

  async save(): Promise<void> {
    if (this.saving() || this.loading()) return;
    const { fields, local } = this.built();
    this.banner.set(null);
    if (Object.keys(local).length) {
      this.fieldErrors.set(Object.fromEntries(Object.entries(local).map(([k, v]) => [k, [v]])));
      return this.fail(new AdminApiError(0, 'LOCAL', 'Fix the highlighted field before saving.'));
    }
    this.saving.set(true);
    this.fieldErrors.set({});
    try {
      let draft: DraftDto;
      const id = this.currentId();
      if (!id) {
        // The key stays the same across retries of this create, so a double click or a retry cannot make two drafts.
        const result = await this.admin.createDraft(this.topicId(), fields, this.createKey);
        draft = result.draft;
        this.createKey = newKey();
      } else {
        draft = await this.admin.saveDraft(this.topicId(), id, this.revision(), fields);
      }
      this.apply(draft);
      this.conflict.set(false);
      this.banner.set({ kind: 'ok', text: 'Saved privately. Nothing is public until you publish.' });
      this.saved.emit(draft);
    } catch (error) {
      this.fail(error);
    } finally {
      this.saving.set(false);
    }
  }

  /** Previews the form as typed (saved or not). A saved problem is also checked by the server for publish readiness. */
  async showPreview(): Promise<void> {
    const { fields, local } = this.built();
    if (Object.keys(local).length) {
      this.fieldErrors.set(Object.fromEntries(Object.entries(local).map(([k, v]) => [k, [v]])));
      return;
    }
    const id = this.currentId();
    if (!id) {
      this.preview.set({
        revision: 0, saved: false,
        problem: { ...(fields as DraftFields), id: 'new', topicId: this.topicId(), media: [] },
        readiness: { publishable: false, errors: [] },
      });
      return;
    }
    try {
      this.preview.set(await this.admin.previewDraft(this.topicId(), id, fields));
    } catch (error) {
      this.fail(error);
    }
  }

  closePreview(): void {
    this.preview.set(null);
  }

  askPublish(): void {
    this.reviewed.set(false);
    this.confirming.set(true);
  }

  async publish(): Promise<void> {
    const id = this.currentId();
    if (!id || !this.canPublish() || !this.reviewed() || this.publishing()) return;
    this.publishing.set(true);
    this.banner.set(null);
    try {
      const result = await this.admin.publishDraft(this.topicId(), id, this.revision());
      const fresh = await this.admin.getDraft(this.topicId(), id);
      this.apply(fresh);
      this.confirming.set(false);
      const path = result.publicPath ?? fresh.publicPath;
      this.banner.set({ kind: 'ok', text: result.unchanged ? 'Nothing changed, so nothing new was published.' : `Published as release ${result.release}. Public pages follow within about a minute.`, link: path ?? undefined });
      this.published.emit({ id, publicPath: path });
    } catch (error) {
      this.confirming.set(false);
      this.fail(error);
    } finally {
      this.publishing.set(false);
    }
  }

  async reloadLatest(): Promise<void> {
    const id = this.currentId();
    if (!id) return;
    await this.open(this.topicId(), id);
    this.banner.set({ kind: 'ok', text: 'Loaded the latest saved version.' });
  }

  mediaSrc(media: PublicMedia): string {
    return this.library.mediaUrl(media);
  }

  private fail(error: unknown): void {
    if (error instanceof AdminApiError) {
      if (error.details.length) this.fieldErrors.set(groupByField(error.details));
      this.conflict.set(error.code === 'STALE_REVISION' || error.code === 'STALE_BASE');
      this.banner.set({ kind: 'error', text: error.message });
    } else {
      this.banner.set({ kind: 'error', text: 'Something went wrong. Nothing was published.' });
    }
  }
}

function groupByField(errors: FieldError[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of errors) (out[e.field] ??= []).push(e.message);
  return out;
}

