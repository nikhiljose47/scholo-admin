import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminApiError, CommunityContentAdminService, type BatchReport } from './community-content-admin.service';
import { CommunityContentAdminPage } from './community-content-admin.page';
import { ProblemLibraryService } from './problem-library.service';

const problems = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `p-${i}`, title: `T${i}` })));

function reportFor(body: string, batchNo: number): BatchReport {
  const rows = (JSON.parse(body) as unknown[]).length;
  return {
    batchId: `b${batchNo}`, topicId: 'topic-polynomials', publishable: rows - 1, publishedRelease: null,
    counts: { rows, new: rows - 1, update: 0, unchanged: 0, invalid: 1, warnings: 0 },
    errors: [{ row: 2, field: 'answer', message: 'answer is blank' }], errorsTruncated: false, warnings: [],
  };
}

function setup(configured = true) {
  const calls = { import: [] as string[], publish: [] as string[][], rollback: [] as string[], revise: [] as string[] };
  let failOnBatch = -1;
  const admin = {
    configured,
    importBatch: async (_t: string, _f: string, body: string) => {
      const n = calls.import.length + 1;
      if (n === failOnBatch) { failOnBatch = -1; throw new AdminApiError(0, 'NETWORK', 'Could not reach the content service. Check your connection and retry.'); }
      calls.import.push(body);
      return reportFor(body, n);
    },
    publish: async (_t: string, ids: string[]) => { calls.publish.push(ids); return { release: 'r000007' }; },
    releases: async () => ({
      active: 'r000002',
      releases: [
        { release: 'r000002', previous: 'r000001', kind: 'edit' as const, createdAt: '2026-11-01T10:00:00Z', itemCount: 5, added: 0, updated: 1, removed: 0 },
        { release: 'r000001', previous: null, kind: 'publish' as const, createdAt: '2026-11-01T09:00:00Z', itemCount: 5, added: 5, updated: 0, removed: 0 },
      ],
    }),
    rollback: async (_t: string, to: string) => { calls.rollback.push(to); return { release: to }; },
    listDrafts: async () => ({ items: [{ id: 'p-aaaaaaaaaaaaaaaaaaaaaaaa', title: 'Half-written', type: 'short_answer', kind: 'new', revision: 2, updatedAt: '2026-11-01T10:00:00Z' }], nextCursor: null }),
    getDraft: async () => ({
      id: 'p-aaaaaaaaaaaaaaaaaaaaaaaa', topicId: 'topic-polynomials', kind: 'new', state: 'draft', revision: 2, createdAt: '', updatedAt: '', createdByYou: true, updatedByYou: true,
      basedOnContentVersion: null, baseStale: false, lastPublish: null, publicPath: null, readiness: { publishable: false, errors: [] },
      fields: { title: 'Half-written', slug: null, type: 'short_answer', difficulty: null, conceptSlugs: [], sectionId: null, tags: [], statement: { format: 'markdown', text: 'Q' }, answer: null, explanation: null, options: null, diagrams: [], media: [], source: null, seoEligible: false },
    }),
    openForRevision: async (_t: string, id: string) => { calls.revise.push(id); return { created: true, draft: { id } }; },
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: CommunityContentAdminService, useValue: admin },
      { provide: ProblemLibraryService, useValue: { detail: () => { throw new Error('unused'); } } },
    ],
  });
  const fixture = TestBed.createComponent(CommunityContentAdminPage);
  fixture.componentInstance.section.set('import'); // these specs exercise the import tab; Add Problem is the default tab
  fixture.detectChanges();
  return { fixture, calls, failNext: (n: number) => (failOnBatch = n), el: fixture.nativeElement as HTMLElement, page: fixture.componentInstance };
}

const settle = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); await fixture.whenStable(); }
  fixture.detectChanges();
};
const pick = async (page: CommunityContentAdminPage, json: string, name = 'problems.json') => {
  await page.chooseFile({ target: { files: [new File([json], name)] } } as unknown as Event);
};
const button = (el: HTMLElement, text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes(text)) as HTMLButtonElement | undefined;

describe('CommunityContentAdminPage', () => {
  it('says so when the service is not configured, and offers no controls', () => {
    const { el } = setup(false);
    expect(el.textContent).toContain('not configured');
    expect(el.querySelector('input[type=file]')).toBeNull();
  });

  it('splits a 450-problem file into bounded batches before sending anything', async () => {
    const { fixture, calls, el, page } = setup();
    await pick(page, problems(450));
    await settle(fixture);
    expect(el.textContent).toContain('450 problems in 3 batches');
    expect(calls.import.length).toBe(0); // nothing leaves the browser until "Check file"
    expect(page.plan()!.batches.map((b) => (JSON.parse(b) as unknown[]).length)).toEqual([200, 200, 50]);
  });

  it('rejects the wrong file type and an unparseable file with a clear message', async () => {
    const { fixture, el, page } = setup();
    await pick(page, 'x', 'notes.txt');
    await settle(fixture);
    expect(el.textContent).toContain('Choose a .json or .csv file');
    await pick(page, '{oops', 'bad.json');
    await settle(fixture);
    expect(el.textContent).toContain('not valid JSON');
  });

  it('checks batches in order, reports rows against the original file, and shows nothing public yet', async () => {
    const { fixture, calls, el, page } = setup();
    await pick(page, problems(450));
    await page.runImport();
    await settle(fixture);
    expect(calls.import.length).toBe(3);
    expect(page.allErrors().map((e) => e.row)).toEqual([2, 202, 402]); // batch rows mapped back to file rows
    const cells = Array.from(el.querySelectorAll('.ca-table tbody tr td:first-child')).map((c) => c.textContent!.trim());
    expect(cells).toEqual(['2', '202', '402']);
    expect(el.textContent).toContain('Nothing is public yet');
    expect(el.querySelector('.ca-stats')!.textContent).toContain('450');
  });

  it('resumes after a failure without re-sending finished batches', async () => {
    const { fixture, calls, el, page, failNext } = setup();
    await pick(page, problems(450));
    failNext(2);
    await page.runImport();
    await settle(fixture);
    expect(calls.import.length).toBe(1);
    expect(el.textContent).toContain('stopped at batch 2 of 3');
    expect(button(el, 'Resume check')).toBeTruthy();
    await page.runImport();
    await settle(fixture);
    expect(calls.import.length).toBe(3);
    expect(page.importFinished()).toBe(true);
  });

  it('publishes only after an explicit second confirmation, then reports the release', async () => {
    const { fixture, calls, el, page } = setup();
    await pick(page, problems(450));
    await page.runImport();
    await settle(fixture);
    button(el, 'Publish 447 problems')!.click();
    await settle(fixture);
    expect(calls.publish.length).toBe(0);
    expect(el.querySelector('[role=alertdialog]')!.textContent).toContain('Make 447 problems public now?');
    button(el, 'Cancel')!.click();
    await settle(fixture);
    expect(calls.publish.length).toBe(0);
    button(el, 'Publish 447 problems')!.click();
    await settle(fixture);
    button(el, 'Yes, publish')!.click();
    await settle(fixture);
    expect(calls.publish).toEqual([['b1', 'b2', 'b3']]);
    expect(el.textContent).toContain('r000007');
  });

  it('pages invalid rows instead of rendering them all at once', async () => {
    const { fixture, el, page } = setup();
    await pick(page, problems(200 * 45)); // 45 batches, 45 errors
    page.reports.set(Array.from({ length: 45 }, (_, i) => reportFor(problems(200), i + 1)));
    await settle(fixture);
    expect(el.querySelectorAll('.ca-table tbody tr').length).toBe(20);
    expect(page.errorPages()).toBe(3);
    page.goErrorPage(1);
    await settle(fixture);
    expect(el.textContent).toContain('Page 2 of 3');
  });

  it('rolls back only after confirming, and never offers rollback to the live release', async () => {
    const { fixture, calls, el, page } = setup();
    page.setSection('releases');
    await settle(fixture);
    const rows = Array.from(el.querySelectorAll('.ca-table tbody tr'));
    expect(rows[0].textContent).toContain('live');
    expect(rows[0].querySelector('button')).toBeNull();
    (rows[1].querySelector('button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(calls.rollback.length).toBe(0);
    button(el, 'Confirm rollback')!.click();
    await settle(fixture);
    expect(calls.rollback).toEqual(['r000001']);
  });

  it('opens on Add Problem, lists private drafts in the Drafts tab, and opens one in the same editor', async () => {
    const { fixture, el, page } = setup();
    page.section.set('add');
    await settle(fixture);
    expect(el.querySelector('app-problem-editor')).toBeTruthy();
    expect(Array.from(el.querySelectorAll('.ca-tabs button')).map((b) => b.textContent!.trim()).slice(0, 4)).toEqual(['Add Problem', 'Drafts', 'Import Problems', 'Published']);

    page.setSection('drafts');
    await settle(fixture);
    expect(el.textContent).toContain('Half-written');
    expect(el.textContent).toContain('never appear on the public site');
    button(el, 'Open')!.click();
    await settle(fixture);
    expect(page.openDraftId()).toBe('p-aaaaaaaaaaaaaaaaaaaaaaaa');
    expect((el.querySelector('app-problem-editor input') as HTMLInputElement).value).toBe('Half-written');
  });

  it('asks before leaving the editor with unsaved work, and stays put when the person declines', async () => {
    const { fixture, page } = setup();
    page.section.set('add');
    await settle(fixture);
    page.editorDirty.set(true);
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    page.setSection('releases');
    expect(confirm).toHaveBeenCalled();
    expect(page.section()).toBe('add');
    confirm.and.returnValue(true);
    page.setSection('releases');
    expect(page.section()).toBe('releases');
    expect(page.hasUnsavedChanges()).toBe(false);
  });

  it('opens a published problem as a private revision in the editor', async () => {
    const { fixture, calls, page } = setup();
    await page.reviseInEditor('p-poly-000001');
    await settle(fixture);
    expect(calls.revise).toEqual(['p-poly-000001']);
    expect(page.section()).toBe('drafts');
    expect(page.openDraftId()).toBe('p-poly-000001');
  });
});
