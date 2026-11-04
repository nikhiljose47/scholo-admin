import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { COMMUNITY_TOPICS } from './community.models';
import { globalRow, splitImportFile, type SplitResult } from '../../models/community-contracts/import-split';
import { IMPORT_LIMITS } from '../../models/community-contracts/problem-import';
import {
  AdminApiError,
  CommunityContentAdminService,
  type BatchReport,
  type ReleaseManifest,
  type RowError,
} from './community-content-admin.service';
import { ProblemLibraryService, type PublicProblemDetail } from './problem-library.service';
import { ProblemEditorComponent } from './problem-editor.component';
import type { DraftListItem, StagedItems } from './community-content-admin.service';

type Section = 'add' | 'drafts' | 'import' | 'edit' | 'releases' | 'media';

/** Tabs in the order of doc 13. "edit" is the Published tab (kept under its old id so existing behaviour is unchanged). */
export const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'add', label: 'Add Problem' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'import', label: 'Import Problems' },
  { id: 'edit', label: 'Published' },
  { id: 'releases', label: 'Releases' },
  { id: 'media', label: 'Images' },
];

const DISCARD = 'You have unsaved changes in the problem editor. Discard them?';

const MAX_FILE_BYTES = 25_000_000;
const ERRORS_PER_PAGE = 20;
const LICENSES = ['Scholo original', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'public-domain'];

/** Shown in the Import Problems tab so the JSON shape doesn't have to be guessed from errors. */
const SAMPLE_IMPORT_JSON = `{
  "problems": [
    {
      "id": "quad-eq-basics-01",
      "slug": "quadratic-equation-basics",
      "type": "mcq",
      "difficulty": "core",
      "title": "Solving a basic quadratic equation",
      "statement": { "format": "markdown", "text": "Solve for x: $x^2 - 5x + 6 = 0$" },
      "answer": { "format": "text", "text": "a" },
      "explanation": { "format": "markdown", "text": "Factor as (x-2)(x-3)=0, so x=2 or x=3." },
      "conceptSlugs": ["quadratic-equations"],
      "tags": ["algebra", "factoring"],
      "options": [
        { "id": "a", "text": "x = 2 or x = 3" },
        { "id": "b", "text": "x = -2 or x = -3" },
        { "id": "c", "text": "x = 1 or x = 6" }
      ],
      "diagrams": [],
      "media": [],
      "source": { "type": "original", "attribution": null, "license": "Scholo original" },
      "seoEligible": true
    }
  ]
}`;

/**
 * Small content console: import (bounded batches, paged errors), review, publish, release history and
 * rollback, single-problem edit, and image upload. The API is authoritative for permissions; every
 * destructive step asks for an explicit second click.
 */
@Component({
  standalone: true,
  imports: [RouterLink, ProblemEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './community-content-admin.page.html',
  styleUrl: './community-content-admin.page.scss',
})
export class CommunityContentAdminPage {
  private readonly admin = inject(CommunityContentAdminService);
  private readonly library = inject(ProblemLibraryService);

  readonly configured = this.admin.configured;
  readonly topics = COMMUNITY_TOPICS.filter((t) => t.status === 'published');
  readonly licenses = LICENSES;
  readonly maxItems = IMPORT_LIMITS.maxItems;
  readonly sections = SECTIONS;
  readonly section = signal<Section>('add');
  readonly topicId = signal(this.topics[0]?.id ?? '');
  readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // ----- import -----
  readonly sampleImportJson = SAMPLE_IMPORT_JSON;
  readonly fileName = signal('');
  readonly plan = signal<SplitResult | null>(null);
  readonly running = signal(false);
  readonly reports = signal<BatchReport[]>([]);
  readonly nextBatch = signal(0);
  readonly errorPage = signal(0);
  readonly confirmPublish = signal(false);
  readonly publishing = signal(false);
  readonly publishedRelease = signal<string | null>(null);

  readonly totals = computed(() => {
    const t = { rows: 0, new: 0, update: 0, unchanged: 0, invalid: 0, warnings: 0, publishable: 0 };
    for (const r of this.reports()) {
      t.rows += r.counts.rows; t.new += r.counts.new; t.update += r.counts.update;
      t.unchanged += r.counts.unchanged; t.invalid += r.counts.invalid; t.warnings += r.counts.warnings; t.publishable += r.publishable;
    }
    return t;
  });
  readonly allErrors = computed<RowError[]>(() => {
    const size = this.plan()?.batchSize ?? IMPORT_LIMITS.maxItems;
    return this.reports().flatMap((report, index) => report.errors.map((e) => ({ ...e, row: globalRow(index, e.row, size) })));
  });
  readonly errorSlice = computed(() => this.allErrors().slice(this.errorPage() * ERRORS_PER_PAGE, (this.errorPage() + 1) * ERRORS_PER_PAGE));
  readonly errorPages = computed(() => Math.max(1, Math.ceil(this.allErrors().length / ERRORS_PER_PAGE)));
  readonly progress = computed(() => ({ done: this.reports().length, total: this.plan()?.batches.length ?? 0 }));
  readonly importFinished = computed(() => !!this.plan() && this.reports().length === this.plan()!.batches.length);

  // ----- releases -----
  readonly releases = signal<{ active: string | null; releases: ReleaseManifest[] } | null>(null);
  readonly rollbackTarget = signal<string | null>(null);
  readonly busy = signal(false);

  // ----- edit -----
  readonly editId = signal('');
  readonly editing = signal<PublicProblemDetail['problem'] | null>(null);
  readonly editErrors = signal<RowError[]>([]);
  readonly confirmUnpublish = signal(false);

  // ----- media -----
  readonly uploaded = signal<{ id: string; created: boolean } | null>(null);

  // ----- single-problem editor (Add Problem and Drafts share one editor) -----
  readonly addNonce = signal(0);
  readonly editorDirty = signal(false);
  readonly openDraftId = signal<string | null>(null);
  readonly drafts = signal<DraftListItem[] | null>(null);
  readonly draftCursor = signal<string | null>(null);
  readonly staged = signal<{ batchId: string; page: StagedItems } | null>(null);

  /** Browser-only guard for in-page navigation; the editor also warns on tab close/reload (beforeunload). */
  hasUnsavedChanges(): boolean {
    return this.editorDirty();
  }

  private leaveOk(): boolean {
    if (!this.editorDirty()) return true;
    return typeof window === 'undefined' ? true : window.confirm(DISCARD);
  }

  setSection(section: Section): void {
    if (section !== this.section() && !this.leaveOk()) return;
    this.editorDirty.set(false);
    this.section.set(section);
    this.message.set(null);
    if (section === 'releases') void this.loadReleases();
    if (section === 'drafts') {
      this.openDraftId.set(null);
      void this.loadDrafts(true);
    }
  }

  newProblem(): void {
    if (!this.leaveOk()) return;
    this.editorDirty.set(false);
    this.addNonce.update((n) => n + 1);
  }

  async loadDrafts(reset: boolean): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const page = await this.admin.listDrafts(this.topicId(), reset ? undefined : (this.draftCursor() ?? undefined));
      this.drafts.set(reset ? page.items : [...(this.drafts() ?? []), ...page.items]);
      this.draftCursor.set(page.nextCursor);
    } catch (error) {
      this.fail(this.describe(error));
    } finally {
      this.busy.set(false);
    }
  }

  openDraft(id: string): void {
    this.openDraftId.set(id);
  }

  closeDraft(): void {
    if (!this.leaveOk()) return;
    this.editorDirty.set(false);
    this.openDraftId.set(null);
    void this.loadDrafts(true);
  }

  /** Opens a live problem as a private working copy; the live version stays public until the revision is published. */
  async reviseInEditor(problemId: string): Promise<void> {
    if (this.busy() || !this.leaveOk()) return;
    this.busy.set(true);
    try {
      const { draft } = await this.admin.openForRevision(this.topicId(), problemId);
      this.editorDirty.set(false);
      this.section.set('drafts');
      this.openDraftId.set(draft.id);
      this.message.set(null);
    } catch (error) {
      this.fail(this.describe(error));
    } finally {
      this.busy.set(false);
    }
  }

  async showStaged(batchId: string, offset = 0): Promise<void> {
    try {
      this.staged.set({ batchId, page: await this.admin.stagedItems(batchId, offset) });
    } catch (error) {
      this.fail(this.describe(error));
    }
  }

  async openImported(batchId: string, problemId: string): Promise<void> {
    if (this.busy() || !this.leaveOk()) return;
    this.busy.set(true);
    try {
      const { draft } = await this.admin.openImported(this.topicId(), batchId, problemId);
      this.editorDirty.set(false);
      this.section.set('drafts');
      this.openDraftId.set(draft.id);
      this.message.set(null);
    } catch (error) {
      this.fail(this.describe(error));
    } finally {
      this.busy.set(false);
    }
  }

  setTopic(id: string): void {
    if (id !== this.topicId() && !this.leaveOk()) return;
    this.editorDirty.set(false);
    this.openDraftId.set(null);
    this.drafts.set(null);
    this.staged.set(null);
    this.addNonce.update((n) => n + 1);
    this.topicId.set(id);
    this.resetImport();
    this.releases.set(null);
    this.editing.set(null);
    if (this.section() === 'releases') void this.loadReleases();
    if (this.section() === 'drafts') void this.loadDrafts(true);
  }

  // ---------------- import ----------------

  async copySample(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.sampleImportJson);
      this.message.set({ kind: 'ok', text: 'Sample JSON copied to the clipboard.' });
    } catch {
      this.fail('Could not copy automatically; select the sample text and copy it manually.');
    }
  }

  async chooseFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.resetImport();
    if (!file) return;
    const format = file.name.toLowerCase().endsWith('.csv') ? 'csv' : file.name.toLowerCase().endsWith('.json') ? 'json' : null;
    if (!format) return this.fail('Choose a .json or .csv file.');
    if (file.size > MAX_FILE_BYTES) return this.fail('That file is larger than 25 MB. Split it into several files.');
    try {
      this.plan.set(splitImportFile(format, await file.text()));
      this.fileName.set(file.name);
    } catch (error) {
      this.fail((error as Error).message);
    }
  }

  async runImport(): Promise<void> {
    const plan = this.plan();
    if (!plan || this.running()) return;
    this.running.set(true);
    this.message.set(null);
    try {
      // Sequential and resumable: a retry skips batches already staged (the API recognises identical uploads).
      for (let i = this.reports().length; i < plan.batches.length; i++) {
        const report = await this.admin.importBatch(this.topicId(), plan.format, plan.batches[i]);
        this.reports.update((list) => [...list, report]);
      }
      this.message.set({ kind: 'ok', text: 'Check finished. Nothing is public yet: review the results, then publish.' });
    } catch (error) {
      this.fail(`${this.describe(error)} (stopped at batch ${this.reports().length + 1} of ${plan.batches.length}; press Resume to continue).`);
    } finally {
      this.running.set(false);
    }
  }

  askPublish(): void {
    this.confirmPublish.set(true);
  }

  cancelPublish(): void {
    this.confirmPublish.set(false);
  }

  async publish(): Promise<void> {
    if (this.publishing()) return;
    const ids = this.reports().filter((r) => r.publishable > 0 && !r.publishedRelease).map((r) => r.batchId);
    if (ids.length === 0) return;
    this.publishing.set(true);
    try {
      let release = '';
      for (let i = 0; i < ids.length; i += IMPORT_LIMITS.maxBatchesPerPublish) {
        const result = await this.admin.publish(this.topicId(), ids.slice(i, i + IMPORT_LIMITS.maxBatchesPerPublish));
        release = result.release;
      }
      this.publishedRelease.set(release);
      this.confirmPublish.set(false);
      this.message.set({ kind: 'ok', text: `Published as release ${release}. It is live now; you can roll back from the Releases section.` });
    } catch (error) {
      this.confirmPublish.set(false);
      this.fail(`${this.describe(error)} Nothing new was made public by the failed step; you can retry.`);
    } finally {
      this.publishing.set(false);
    }
  }

  goErrorPage(delta: number): void {
    this.errorPage.update((p) => Math.min(this.errorPages() - 1, Math.max(0, p + delta)));
  }

  private resetImport(): void {
    this.plan.set(null);
    this.fileName.set('');
    this.reports.set([]);
    this.errorPage.set(0);
    this.confirmPublish.set(false);
    this.publishedRelease.set(null);
    this.message.set(null);
  }

  // ---------------- releases ----------------

  async loadReleases(): Promise<void> {
    this.busy.set(true);
    try {
      this.releases.set(await this.admin.releases(this.topicId()));
    } catch (error) {
      this.fail(this.describe(error));
    } finally {
      this.busy.set(false);
    }
  }

  askRollback(release: string): void {
    this.rollbackTarget.set(release);
  }

  async confirmRollback(): Promise<void> {
    const target = this.rollbackTarget();
    if (!target || this.busy()) return;
    this.busy.set(true);
    try {
      await this.admin.rollback(this.topicId(), target);
      this.rollbackTarget.set(null);
      this.message.set({ kind: 'ok', text: `Rolled back to ${target}. Public pages show it within about a minute.` });
      this.releases.set(await this.admin.releases(this.topicId()));
    } catch (error) {
      this.rollbackTarget.set(null);
      this.fail(this.describe(error));
    } finally {
      this.busy.set(false);
    }
  }

  // ---------------- edit ----------------

  async loadForEdit(): Promise<void> {
    const id = this.editId().trim();
    if (!id) return;
    this.busy.set(true);
    this.editErrors.set([]);
    this.confirmUnpublish.set(false);
    try {
      const detail = await new Promise<PublicProblemDetail>((resolve, reject) =>
        this.library.detail(this.topicId(), id).subscribe({ next: resolve, error: reject }),
      );
      this.editing.set(detail.problem);
      this.message.set(null);
    } catch {
      this.editing.set(null);
      this.fail('That problem was not found in the published catalog for this topic.');
    } finally {
      this.busy.set(false);
    }
  }

  async saveEdit(form: { title: string; difficulty: string; tags: string; statement: string; answer: string; explanation: string }): Promise<void> {
    const p = this.editing();
    if (!p || this.busy()) return;
    const changes: Record<string, unknown> = {};
    if (form.title !== p.title) changes['title'] = form.title;
    if (form.difficulty !== p.difficulty) changes['difficulty'] = form.difficulty;
    const tags = form.tags.split(',').map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
    if (tags.join('|') !== p.tags.join('|')) changes['tags'] = tags;
    if (form.statement !== p.statement.text) changes['statement'] = { ...p.statement, text: form.statement };
    if (form.answer !== p.answer.text) changes['answer'] = { ...p.answer, text: form.answer };
    if (form.explanation !== p.explanation.text) changes['explanation'] = { ...p.explanation, text: form.explanation };
    if (Object.keys(changes).length === 0) return this.fail('Nothing was changed.');
    this.busy.set(true);
    this.editErrors.set([]);
    try {
      const result = await this.admin.edit(this.topicId(), p.id, p.contentVersion, changes);
      this.message.set({ kind: 'ok', text: result.unchanged ? 'No effective change.' : `Saved as version ${result.contentVersion} in release ${result.release}.` });
      await this.loadForEdit();
    } catch (error) {
      if (error instanceof AdminApiError && error.details.length) this.editErrors.set(error.details as RowError[]);
      this.fail(this.describe(error));
    } finally {
      this.busy.set(false);
    }
  }

  askUnpublish(): void {
    this.confirmUnpublish.set(true);
  }

  async unpublish(): Promise<void> {
    const p = this.editing();
    if (!p || this.busy()) return;
    this.busy.set(true);
    try {
      await this.admin.unpublish(this.topicId(), p.id, p.contentVersion);
      this.editing.set(null);
      this.confirmUnpublish.set(false);
      this.message.set({ kind: 'ok', text: `${p.id} is no longer public. Roll back from Releases to restore it.` });
    } catch (error) {
      this.confirmUnpublish.set(false);
      this.fail(this.describe(error));
    } finally {
      this.busy.set(false);
    }
  }

  // ---------------- media ----------------

  async uploadMedia(event: Event, fileInput: HTMLInputElement, alt: string, license: string, attribution: string): Promise<void> {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) return this.fail('Choose an image (PNG, JPEG or WebP, up to 1 MB).');
    if (!alt.trim()) return this.fail('Describe the image for screen-reader users (alt text is required).');
    this.busy.set(true);
    this.uploaded.set(null);
    try {
      const result = await this.admin.uploadMedia(file, alt.trim(), license, attribution.trim());
      this.uploaded.set({ id: result.media.id, created: result.created });
      this.message.set(null);
    } catch (error) {
      this.fail(this.describe(error));
    } finally {
      this.busy.set(false);
    }
  }

  private fail(text: string): void {
    this.message.set({ kind: 'error', text });
  }

  private describe(error: unknown): string {
    return error instanceof AdminApiError ? error.message : 'Something went wrong. Nothing was changed.';
  }
}
