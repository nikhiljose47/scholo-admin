import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdminApiError, CommunityContentAdminService, type DraftDto } from './community-content-admin.service';
import { ProblemEditorComponent } from './problem-editor.component';
import { ProblemLibraryService } from './problem-library.service';
import type { DraftFields } from '../../models/community-contracts/problem-draft';

const TOPIC = 'topic-polynomials';

function dto(over: Partial<DraftDto> & { fields?: Partial<DraftFields> } = {}): DraftDto {
  const { fields, ...rest } = over;
  return {
    id: 'p-aaaaaaaaaaaaaaaaaaaaaaaa', topicId: TOPIC, kind: 'new', state: 'draft', revision: 1,
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', createdByYou: true, updatedByYou: true,
    basedOnContentVersion: null, baseStale: false, lastPublish: null, publicPath: null,
    readiness: { publishable: false, errors: [{ field: 'answer', message: 'answer is required to publish' }] },
    fields: {
      title: 'T', slug: null, type: 'short_answer', difficulty: null, conceptSlugs: [], sectionId: null, tags: [],
      statement: { format: 'markdown', text: 'Q' }, answer: null, explanation: null, options: null, diagrams: [], media: [], source: null,
      seoEligible: false, ...fields,
    },
    ...rest,
  };
}

function setup(draftId: string | null = null, over: Record<string, unknown> = {}) {
  const calls = {
    create: [] as Array<{ fields: Partial<DraftFields>; key: string }>,
    save: [] as Array<{ revision: number; changes: Partial<DraftFields> }>,
    publish: [] as number[],
    preview: 0,
  };
  const admin = {
    configured: true,
    createDraft: async (_t: string, fields: Partial<DraftFields>, key: string) => {
      calls.create.push({ fields, key });
      return { created: true, draft: dto({ fields: fields as DraftFields }) };
    },
    saveDraft: async (_t: string, _id: string, revision: number, changes: Partial<DraftFields>) => {
      calls.save.push({ revision, changes });
      return dto({ revision: revision + 1, fields: changes as DraftFields });
    },
    getDraft: async () => dto({ revision: 3 }),
    previewDraft: async (_t: string, _id: string, fields: DraftFields) => {
      calls.preview++;
      return { revision: 1, saved: false, problem: { ...fields, id: 'x', topicId: TOPIC, media: [] }, readiness: { publishable: true, errors: [] } };
    },
    publishDraft: async (_t: string, _id: string, revision: number) => {
      calls.publish.push(revision);
      return { release: 'r000009', contentVersion: 1, publicPath: '/communities/mathematics/polynomials/problems/p-a/t' };
    },
    ...over,
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: CommunityContentAdminService, useValue: admin },
      { provide: ProblemLibraryService, useValue: { mediaUrl: (m: { url: string }) => m.url } },
    ],
  });
  const fixture = TestBed.createComponent(ProblemEditorComponent);
  fixture.componentRef.setInput('topicId', TOPIC);
  fixture.componentRef.setInput('draftId', draftId);
  fixture.detectChanges();
  return { fixture, calls, el: fixture.nativeElement as HTMLElement, ed: fixture.componentInstance, admin };
}

const settle = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); await fixture.whenStable(); }
  fixture.detectChanges();
};
const btn = (el: HTMLElement, text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim().startsWith(text)) as HTMLButtonElement | undefined;
const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };

describe('ProblemEditorComponent', () => {
  it('saves a new problem as a private draft with only the typed content, and never autosaves', async () => {
    const { fixture, calls, el, ed } = setup();
    await settle(fixture);
    expect(ed.dirty()).toBe(false);
    type(el.querySelector('input')!, 'Factorise a quadratic');
    type(el.querySelector('textarea')!, 'Factorise $x^2+5x+6$.');
    await settle(fixture);
    expect(ed.dirty()).toBe(true);
    expect(el.querySelector('.pe-state')!.textContent).toContain('Unsaved changes');
    expect(calls.create.length).toBe(0); // manual save only

    btn(el, 'Save draft')!.click();
    await settle(fixture);
    expect(calls.create.length).toBe(1);
    const sent = calls.create[0].fields as Record<string, unknown>;
    expect(sent['title']).toBe('Factorise a quadratic');
    expect(sent['answer']).toBeNull(); // answer and explanation can be added later
    expect(sent['explanation']).toBeNull();
    expect(Object.keys(sent)).not.toEqual(jasmine.arrayContaining(['id', 'revision', 'visibility', 'topicId', 'createdBy']));
    expect(calls.create[0].key.length).toBeGreaterThan(8);
    expect(ed.dirty()).toBe(false);
    expect(el.textContent).toContain('Saved privately');
  });

  it('a second save updates the same draft using the revision it last saw', async () => {
    const { fixture, calls, el, ed } = setup();
    type(el.querySelector('input')!, 'First');
    await settle(fixture);
    btn(el, 'Save draft')!.click();
    await settle(fixture);
    type(el.querySelector('input')!, 'Second');
    await settle(fixture);
    btn(el, 'Save draft')!.click();
    await settle(fixture);
    expect(calls.create.length).toBe(1);
    expect(calls.save.length).toBe(1);
    expect(calls.save[0].revision).toBe(1);
    expect(ed.revision()).toBe(2);
  });

  it('includes an optional sectionId in the draft payload without changing conceptSlugs', async () => {
    const { fixture, calls, el, ed } = setup();
    await settle(fixture);
    type(el.querySelector('input')!, 'Section-linked problem');
    type(el.querySelector('textarea')!, 'Question');
    ed.sectionId.set('section-poly-1-1');
    btn(el, 'Save draft')!.click();
    await settle(fixture);
    expect(calls.create[0].fields.sectionId).toBe('section-poly-1-1');
    expect(calls.create[0].fields.conceptSlugs).toEqual([]);
  });

  it('keeps Publish disabled until the saved copy is publishable, and explains what is missing', async () => {
    const { fixture, el } = setup();
    await settle(fixture);
    expect(btn(el, 'Publish')!.disabled).toBe(true);
    expect(el.querySelector('.pe-needs')!.textContent).toContain('Save the draft first');

    type(el.querySelector('input')!, 'Title');
    type(el.querySelector('textarea')!, 'Statement');
    await settle(fixture);
    btn(el, 'Save draft')!.click();
    await settle(fixture);
    expect(btn(el, 'Publish')!.disabled).toBe(true);
    expect(el.querySelector('.pe-needs')!.textContent).toContain('answer is required to publish');
  });

  it('publishes only after an explicit confirmation, using the saved revision, then shows the public link', async () => {
    const ready = dto({ revision: 5, readiness: { publishable: true, errors: [] } });
    const { fixture, calls, el } = setup(ready.id, { getDraft: async () => ready });
    await settle(fixture);
    expect(btn(el, 'Publish…')!.disabled).toBe(false);
    btn(el, 'Publish…')!.click();
    await settle(fixture);
    const go = btn(el, 'Publish now')!;
    expect(go.disabled).toBe(true); // needs the "I checked" box
    expect(calls.publish.length).toBe(0);
    const box = el.querySelector('.pe-confirm input[type=checkbox]') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(fixture);
    btn(el, 'Publish now')!.click();
    await settle(fixture);
    expect(calls.publish).toEqual([5]);
    expect(el.textContent).toContain('r000009');
  });

  it('shows server field errors next to the field and keeps what was typed', async () => {
    const failing = {
      createDraft: async () => { throw new AdminApiError(422, 'VALIDATION_FAILED', 'The draft cannot be saved', [{ field: 'title', message: 'title is required' }, { field: 'statement', message: 'statement exceeds 8000 characters' }]); },
    };
    const { fixture, el, ed } = setup(null, failing);
    type(el.querySelector('textarea')!, 'Typed question');
    await settle(fixture);
    btn(el, 'Save draft')!.click();
    await settle(fixture);
    expect(el.querySelector('#pe-err-title')!.textContent).toContain('title is required');
    expect(el.querySelector('#pe-err-statement')!.textContent).toContain('exceeds 8000');
    expect(el.querySelector('input[aria-invalid=true]')).toBeTruthy();
    expect(ed.statement()).toBe('Typed question');
  });

  it('turns a stale-revision conflict into a clear choice instead of overwriting', async () => {
    const stale = { saveDraft: async () => { throw new AdminApiError(409, 'STALE_REVISION', 'This draft was saved by another admin (revision 4); reload before editing'); } };
    const { fixture, el, ed } = setup('p-aaaaaaaaaaaaaaaaaaaaaaaa', stale);
    await settle(fixture);
    type(el.querySelector('input')!, 'My edit');
    await settle(fixture);
    btn(el, 'Save draft')!.click();
    await settle(fixture);
    expect(el.querySelector('[role=alert]')!.textContent).toContain('another admin');
    expect(ed.conflict()).toBe(true);
    expect(btn(el, 'Load the latest')).toBeTruthy();
    expect(ed.title()).toBe('My edit'); // nothing is lost until they choose
    btn(el, 'Load the latest')!.click();
    await settle(fixture);
    expect(ed.title()).toBe('T');
    expect(ed.dirty()).toBe(false);
  });

  it('previews KaTeX maths and an approved diagram, privately', async () => {
    const { fixture, el, ed } = setup();
    ed.statement.set('Solve $x^2 + 5x + 6 = 0$.');
    ed.title.set('Quadratic');
    ed.diagramsJson.set(JSON.stringify({
      version: 1, kind: 'graph', x: { min: 0, max: 5, label: 'x' }, y: { min: -1, max: 6, label: 'y' },
      series: [{ points: [[0, 6], [2, 0], [3, 0], [5, 6]], markers: true, label: 'y' }], alt: 'A parabola',
    }));
    await settle(fixture);
    btn(el, 'Preview')!.click();
    await settle(fixture);
    const preview = el.querySelector('.pe-preview')!;
    expect(preview.textContent).toContain('Private preview');
    expect(preview.querySelector('.katex')).toBeTruthy();
    expect(preview.querySelector('svg[role=img]')).toBeTruthy();
    expect(preview.querySelector('script')).toBeNull();
  });

  it('renders hostile text in the preview as inert text', async () => {
    const { fixture, el, ed } = setup();
    ed.title.set('x');
    ed.statement.set('<img src=x onerror=alert(1)> <script>alert(2)</script> [click](javascript:alert(3))');
    await settle(fixture);
    btn(el, 'Preview')!.click();
    await settle(fixture);
    const preview = el.querySelector('.pe-preview')!;
    expect(preview.querySelector('img[onerror]')).toBeNull();
    expect(preview.querySelector('script')).toBeNull();
    expect(Array.from(preview.querySelectorAll('a')).every((a) => !(a.getAttribute('href') ?? '').startsWith('javascript:'))).toBe(true);
  });

  it('reports an unparseable diagram locally without sending anything', async () => {
    const { fixture, calls, el, ed } = setup();
    ed.title.set('x');
    ed.statement.set('q');
    ed.diagramsJson.set('{not json');
    await settle(fixture);
    btn(el, 'Save draft')!.click();
    await settle(fixture);
    expect(calls.create.length).toBe(0);
    expect(el.querySelector('#pe-err-diagrams')!.textContent).toContain('not valid JSON');
  });

  it('builds MCQ options and derives the correct answer from the ticked options', async () => {
    const { fixture, calls, el, ed } = setup();
    ed.title.set('mcq');
    ed.statement.set('Pick one');
    ed.setType('mcq');
    ed.setOption('a', { text: '$(x+1)(x+6)$' });
    ed.setOption('b', { text: '$(x+2)(x+3)$' });
    ed.toggleCorrect('b', true);
    await settle(fixture);
    btn(el, 'Save draft')!.click();
    await settle(fixture);
    const f = calls.create[0].fields as Record<string, any>;
    expect(f['options'].map((o: { id: string }) => o.id)).toEqual(['a', 'b']);
    expect(f['answer']).toEqual({ format: 'text', text: 'b' });
  });

  it('warns about unsaved changes on tab close only while there are some, and stops listening when destroyed', async () => {
    // Capture the handler instead of dispatching a real beforeunload (Karma treats that as a page reload).
    const add = spyOn(window, 'addEventListener').and.callThrough();
    const { fixture, el, ed } = setup();
    await settle(fixture);
    const handler = add.calls.allArgs().find((a) => a[0] === 'beforeunload')![1] as (e: BeforeUnloadEvent) => void;
    const fake = () => ({ preventDefault: jasmine.createSpy('preventDefault'), returnValue: undefined as unknown }) as unknown as BeforeUnloadEvent;

    const clean = fake();
    handler(clean);
    expect(clean.preventDefault).not.toHaveBeenCalled();

    type(el.querySelector('input')!, 'typing');
    await settle(fixture);
    const dirty = fake();
    handler(dirty);
    expect(dirty.preventDefault).toHaveBeenCalled();
    expect(ed.hasUnsavedChanges()).toBe(true);

    const remove = spyOn(window, 'removeEventListener').and.callThrough();
    fixture.destroy();
    expect(remove).toHaveBeenCalledWith('beforeunload', handler);
  });
});
