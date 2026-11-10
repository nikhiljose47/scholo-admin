// Copied from nikhiljose47/free-online-tutor packages/community-contracts/src/problem-library.ts
// at commit 8aa3927cbafd9a1b76f8ce343a4565a727f95d58 -- keep in sync manually.
// Problem Library contracts: types, limits, validation, R2 key layout, cursor and index query logic.
// Pure TypeScript with no Angular, Cloudflare or Node imports, so the Worker, the admin tooling and
// the Angular app can all share it.

import { DIAGRAM_LIMITS, validateDiagramSpec } from './diagram-spec';
import { MEDIA_ID_PATTERN, MEDIA_LIMITS, type PublicMedia } from './media';

export const PROBLEM_SCHEMA_VERSION = 1;

export const PROBLEM_TYPES = ['mcq', 'short_answer', 'worked_solution'] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];

// Same values the discussion system already stores in SQLite; do not rename.
export const PROBLEM_DIFFICULTIES = ['foundation', 'core', 'advanced'] as const;
export type ProblemDifficulty = (typeof PROBLEM_DIFFICULTIES)[number];

export const PROBLEM_VISIBILITIES = ['draft', 'review', 'published', 'archived'] as const;
export type ProblemVisibility = (typeof PROBLEM_VISIBILITIES)[number];

export const PROBLEM_SOURCE_TYPES = ['original', 'licensed', 'permission'] as const;
export type ProblemSourceType = (typeof PROBLEM_SOURCE_TYPES)[number];

export const LIMITS = {
  idPattern: /^[a-z0-9][a-z0-9-]{2,63}$/,
  slugPattern: /^[a-z0-9][a-z0-9-]{0,95}$/,
  tagPattern: /^[a-z0-9][a-z0-9-]{0,29}$/,
  maxTags: 10,
  maxConcepts: 5,
  maxTitle: 200,
  maxStatement: 8_000,
  maxAnswer: 2_000,
  maxExplanation: 16_000,
  maxOptions: 8,
  maxOptionText: 500,
  maxItemBytes: 100_000,
  defaultPageSize: 20,
  maxPageSize: 50,
  maxQuery: 100,
  maxCursor: 600,
} as const;

export interface RichText {
  format: 'markdown' | 'latex' | 'text';
  text: string;
}

export interface McqOption {
  id: string;
  text: string;
  explanation?: string;
}

export interface ProblemSource {
  type: ProblemSourceType;
  attribution: string | null;
  license: string;
}

export interface PreparedProblem {
  schemaVersion: 1;
  id: string;
  topicId: string;
  slug: string;
  title: string;
  type: ProblemType;
  difficulty: ProblemDifficulty;
  conceptSlugs: string[];
  /** Optional canonical syllabus section id; legacy items may omit it. */
  sectionId?: string | null;
  tags: string[];
  statement: RichText;
  answer: RichText;
  explanation: RichText;
  /** MCQ only: the choices. `answer.text` then holds the correct option id(s), comma separated. */
  options: McqOption[] | null;
  /** Validated DiagramSpec objects (data only). Never HTML or script. */
  diagrams: unknown[];
  /** Ids of uploaded raster images (m-<20 hex>); resolved to PublicMedia by the public API. */
  media: string[];
  source: ProblemSource;
  visibility: ProblemVisibility;
  seoEligible: boolean;
  publishedAt: string | null;
  updatedAt: string;
  contentVersion: number;
}

/** Public list row. Compact: no statement, answer or explanation, and no storage details. */
export interface ProblemSummary {
  id: string;
  topicId: string;
  slug: string;
  title: string;
  type: ProblemType;
  difficulty: ProblemDifficulty;
  conceptSlugs: string[];
  sectionId?: string | null;
  tags: string[];
  publishedAt: string;
  seoEligible: boolean;
  contentVersion: number;
}

/**
 * One row of the per-topic release index: the public summary plus where the immutable item body
 * lives. `batchId` is an unguessable 128-bit id, so an unpublished (staged) body cannot be found by
 * guessing a URL even though the whole bucket is served from a public domain.
 */
export interface ProblemIndexEntry extends ProblemSummary {
  batchId: string;
  contentHash: string;
  /** When the content last changed (sitemap lastmod). Absent in releases built before it existed. */
  updatedAt?: string;
}

export interface ProblemIndexFile {
  schemaVersion: 1;
  topicId: string;
  release: string;
  /** Sorted by publishedAt DESC, id DESC. */
  items: ProblemIndexEntry[];
}

/** Per-topic pointer to the active release. Flipped last, with compare-and-swap. */
export interface ActiveRelease {
  release: string;
  /** Highest release number ever created for the topic, so numbers are never reused after a rollback. */
  highest: number;
  previous: string | null;
  updatedAt: string;
}

export interface ProblemListResponse {
  items: ProblemSummary[];
  nextCursor: string | null;
  catalogVersion: string;
}

export interface PublicProblemDetail {
  problem: Omit<PreparedProblem, 'visibility' | 'schemaVersion' | 'media'> & { media: PublicMedia[] };
  catalogVersion: string;
}

/** Topic shape the validators need; community.models.ts COMMUNITY_TOPICS satisfies it. */
export interface TopicLike {
  id: string;
  status?: string;
  concepts: ReadonlyArray<{ slug: string }>;
  /** The Worker must supply this registry to validate a non-null sectionId. */
  sections?: ReadonlyArray<{ id: string; active?: boolean }>;
}

// ---- R2 key layout (all under one prefix so existing syllabus/puzzle keys are never touched) ----

export const LIBRARY_PREFIX = 'community-library';

export const libraryKeys = {
  active: (topicId: string) => `${LIBRARY_PREFIX}/topics/${topicId}/active.json`,
  index: (topicId: string, release: string) =>
    `${LIBRARY_PREFIX}/topics/${topicId}/releases/${release}/index.json`,
  manifest: (topicId: string, release: string) =>
    `${LIBRARY_PREFIX}/topics/${topicId}/releases/${release}/manifest.json`,
  releasesPrefix: (topicId: string) => `${LIBRARY_PREFIX}/topics/${topicId}/releases/`,
  item: (topicId: string, batchId: string, problemId: string) =>
    `${LIBRARY_PREFIX}/topics/${topicId}/items/${batchId}/${problemId}.json`,
  mediaMeta: (mediaId: string) => `${LIBRARY_PREFIX}/media/${mediaId}.json`,
  mediaFile: (mediaId: string, ext: string) => `${LIBRARY_PREFIX}/media/${mediaId}.${ext}`,
  // Admin-only objects (set LIBRARY_ADMIN to keep these in a private bucket).
  batch: (batchId: string) => `${LIBRARY_PREFIX}/admin/batches/${batchId}.json`,
  source: (topicId: string, sha256: string) => `${LIBRARY_PREFIX}/admin/sources/${topicId}/${sha256}.json`,
  lock: (topicId: string) => `${LIBRARY_PREFIX}/admin/locks/${topicId}.json`,
  audit: (topicId: string, stamp: string) => `${LIBRARY_PREFIX}/admin/audit/${topicId}/${stamp}.json`,
  // One private working copy per problem. Editing it writes this one object and nothing else.
  draft: (topicId: string, problemId: string) => `${LIBRARY_PREFIX}/admin/drafts/${topicId}/${problemId}.json`,
  draftsPrefix: (topicId: string) => `${LIBRARY_PREFIX}/admin/drafts/${topicId}/`,
};

export const RELEASE_PATTERN = /^r\d{6,}$/;
export const BATCH_ID_PATTERN = /^[0-9a-f]{32}$/;

export function releaseId(n: number): string {
  return `r${String(n).padStart(6, '0')}`;
}

export function releaseNumber(release: string): number {
  return Number(release.slice(1));
}

// ---- Validation ----

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkRichText(v: unknown, field: string, max: number, errors: string[], required = true): RichText | null {
  if (!isObject(v)) {
    if (required) errors.push(`${field} must be an object {format, text}`);
    return null;
  }
  if (v['format'] !== 'markdown' && v['format'] !== 'latex' && v['format'] !== 'text') {
    errors.push(`${field}.format must be markdown, latex or text`);
  }
  const text = v['text'];
  if (typeof text !== 'string' || text.trim() === '') errors.push(`${field}.text must be a non-empty string`);
  else if (text.length > max) errors.push(`${field}.text exceeds ${max} characters`);
  return errors.length ? null : (v as unknown as RichText);
}

export function normalizeTag(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

/**
 * Runtime validation of an untrusted PreparedProblem. Used by the importer/editor (Phase 4) and as a
 * defence-in-depth check before serving. Pass the approved topics so unknown topic/concept ids fail closed.
 */
export function validatePreparedProblem(
  input: unknown,
  topics: ReadonlyArray<TopicLike>,
): ValidationResult<PreparedProblem> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ['problem must be an object'] };

  if (input['schemaVersion'] !== PROBLEM_SCHEMA_VERSION) errors.push(`schemaVersion must be ${PROBLEM_SCHEMA_VERSION}`);

  const id = input['id'];
  if (typeof id !== 'string' || !LIMITS.idPattern.test(id)) errors.push('id must match ^[a-z0-9][a-z0-9-]{2,63}$');
  const slug = input['slug'];
  if (typeof slug !== 'string' || !LIMITS.slugPattern.test(slug)) errors.push('slug must be lowercase letters, digits and hyphens');

  const topic = topics.find((t) => t.id === input['topicId']);
  if (!topic) errors.push('topicId is not an approved topic');

  const title = input['title'];
  if (typeof title !== 'string' || title.trim() === '') errors.push('title is required');
  else if (title.length > LIMITS.maxTitle) errors.push(`title exceeds ${LIMITS.maxTitle} characters`);

  if (!PROBLEM_TYPES.includes(input['type'] as ProblemType)) errors.push(`type must be one of ${PROBLEM_TYPES.join(', ')}`);
  if (!PROBLEM_DIFFICULTIES.includes(input['difficulty'] as ProblemDifficulty)) {
    errors.push(`difficulty must be one of ${PROBLEM_DIFFICULTIES.join(', ')}`);
  }
  if (!PROBLEM_VISIBILITIES.includes(input['visibility'] as ProblemVisibility)) {
    errors.push(`visibility must be one of ${PROBLEM_VISIBILITIES.join(', ')}`);
  }

  const concepts = input['conceptSlugs'] ?? [];
  if (!Array.isArray(concepts) || concepts.length > LIMITS.maxConcepts) {
    errors.push(`conceptSlugs must be an array containing 0-${LIMITS.maxConcepts} valid concept slugs`);
  } else if (topic) {
    for (const c of concepts) {
      if (typeof c !== 'string' || !topic.concepts.some((tc) => tc.slug === c)) {
        errors.push(`conceptSlugs contains "${String(c)}", which is not a concept of ${topic.id}`);
      }
    }
  }

  const rawSectionId = input['sectionId'];
  let sectionId: string | null = null;
  if (rawSectionId !== null && rawSectionId !== undefined && rawSectionId !== '') {
    if (typeof rawSectionId !== 'string' || !LIMITS.idPattern.test(rawSectionId)) {
      errors.push('sectionId must be a valid section id or null');
    } else if (!topic?.sections?.some((section) => section.id === rawSectionId && section.active !== false)) {
      errors.push(`sectionId "${rawSectionId}" is not an active section of ${String(input['topicId'])}`);
    } else {
      sectionId = rawSectionId;
    }
  }

  const tags = input['tags'];
  if (!Array.isArray(tags) || tags.length > LIMITS.maxTags) errors.push(`tags must be an array of at most ${LIMITS.maxTags}`);
  else {
    for (const t of tags) {
      if (typeof t !== 'string' || !LIMITS.tagPattern.test(t)) errors.push(`tag "${String(t)}" must be normalized lowercase (letters, digits, hyphens, max 30)`);
    }
    if (new Set(tags).size !== tags.length) errors.push('tags must be unique');
  }

  checkRichText(input['statement'], 'statement', LIMITS.maxStatement, errors);
  checkRichText(input['answer'], 'answer', LIMITS.maxAnswer, errors);
  checkRichText(input['explanation'], 'explanation', LIMITS.maxExplanation, errors);

  const options = input['options'];
  if (input['type'] === 'mcq') {
    if (!Array.isArray(options) || options.length < 2 || options.length > LIMITS.maxOptions) {
      errors.push(`mcq problems need 2-${LIMITS.maxOptions} options`);
    } else {
      const ids = new Set<string>();
      for (const o of options) {
        if (!isObject(o) || typeof o['id'] !== 'string' || typeof o['text'] !== 'string' || o['text'].trim() === '' || o['text'].length > LIMITS.maxOptionText) {
          errors.push('each option needs an id and non-empty text');
        } else {
          ids.add(o['id']);
          const note = o['explanation'];
          if (note !== undefined && (typeof note !== 'string' || note.length > LIMITS.maxOptionText)) {
            errors.push(`option "${o['id']}" explanation must be text of at most ${LIMITS.maxOptionText} characters`);
          }
        }
      }
      if (ids.size !== options.length) errors.push('option ids must be unique');
      const answerText = isObject(input['answer']) ? input['answer']['text'] : null;
      if (typeof answerText === 'string') {
        for (const part of answerText.split(',').map((s) => s.trim())) {
          if (!ids.has(part)) errors.push(`mcq answer "${part}" is not an option id`);
        }
      }
    }
  } else if (options !== null && options !== undefined) {
    errors.push('options must be null unless type is mcq');
  }

  const diagrams = input['diagrams'];
  if (!Array.isArray(diagrams) || diagrams.length > DIAGRAM_LIMITS.maxPerProblem) {
    errors.push(`diagrams must be an array of at most ${DIAGRAM_LIMITS.maxPerProblem} diagram specs`);
  } else {
    diagrams.forEach((d, i) => {
      const r = validateDiagramSpec(d);
      if (!r.ok) for (const e of r.errors) errors.push(`diagrams[${i}].${e}`);
    });
  }
  const media = input['media'];
  if (!Array.isArray(media) || media.length > MEDIA_LIMITS.maxPerProblem) {
    errors.push(`media must be an array of at most ${MEDIA_LIMITS.maxPerProblem} media ids`);
  } else {
    for (const m of media) if (typeof m !== 'string' || !MEDIA_ID_PATTERN.test(m)) errors.push(`media id "${String(m).slice(0, 40)}" is not valid (expected m- followed by 20 hex characters from an upload)`);
    if (new Set(media).size !== media.length) errors.push('media ids must be unique');
  }

  const source = input['source'];
  if (!isObject(source)) errors.push('source is required (provenance)');
  else {
    if (!PROBLEM_SOURCE_TYPES.includes(source['type'] as ProblemSourceType)) errors.push(`source.type must be one of ${PROBLEM_SOURCE_TYPES.join(', ')}`);
    if (typeof source['license'] !== 'string' || source['license'].trim() === '') errors.push('source.license is required');
    if (source['type'] !== 'original' && (typeof source['attribution'] !== 'string' || source['attribution'].trim() === '')) {
      errors.push('source.attribution is required unless the source is original');
    }
  }

  if (typeof input['seoEligible'] !== 'boolean') errors.push('seoEligible must be a boolean');
  const updatedAt = input['updatedAt'];
  if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) errors.push('updatedAt must be an ISO date string');
  const publishedAt = input['publishedAt'];
  if (input['visibility'] === 'published') {
    if (typeof publishedAt !== 'string' || Number.isNaN(Date.parse(publishedAt))) errors.push('published problems need an ISO publishedAt');
  } else if (publishedAt !== null && publishedAt !== undefined && (typeof publishedAt !== 'string' || Number.isNaN(Date.parse(publishedAt)))) {
    errors.push('publishedAt must be null or an ISO date string');
  }
  if (!Number.isInteger(input['contentVersion']) || (input['contentVersion'] as number) < 1) errors.push('contentVersion must be a positive integer');

  if (errors.length === 0 && JSON.stringify(input).length > LIMITS.maxItemBytes) errors.push(`item exceeds ${LIMITS.maxItemBytes} bytes`);

  return errors.length ? { ok: false, errors } : { ok: true, value: normalizeProblem(input) };
}

const richText = (v: unknown): RichText => {
  const r = v as { format: RichText['format']; text: string };
  return { format: r.format, text: r.text };
};

/**
 * Projects a VALIDATED problem onto exactly the known fields. Unknown keys (extra properties on nested objects,
 * anything a client sneaked in) are dropped, so what is stored and later served is an allowlist, not the raw input.
 */
function normalizeProblem(input: Record<string, unknown>): PreparedProblem {
  const src = input['source'] as Record<string, unknown>;
  const options = input['options'];
  return {
    schemaVersion: 1,
    id: input['id'] as string,
    topicId: input['topicId'] as string,
    slug: input['slug'] as string,
    title: input['title'] as string,
    type: input['type'] as ProblemType,
    difficulty: input['difficulty'] as ProblemDifficulty,
    conceptSlugs: [...((input['conceptSlugs'] as string[] | undefined) ?? [])],
    sectionId: typeof input['sectionId'] === 'string' && input['sectionId'] !== '' ? input['sectionId'] : null,
    tags: [...(input['tags'] as string[])],
    statement: richText(input['statement']),
    answer: richText(input['answer']),
    explanation: richText(input['explanation']),
    options: Array.isArray(options)
      ? options.map((o: Record<string, unknown>) => ({
          id: o['id'] as string,
          text: o['text'] as string,
          ...(typeof o['explanation'] === 'string' ? { explanation: o['explanation'] } : {}),
        }))
      : null,
    diagrams: [...(input['diagrams'] as unknown[])],
    media: [...(input['media'] as string[])],
    source: { type: src['type'] as ProblemSourceType, attribution: (src['attribution'] as string | null | undefined) ?? null, license: src['license'] as string },
    visibility: input['visibility'] as ProblemVisibility,
    seoEligible: input['seoEligible'] as boolean,
    publishedAt: (input['publishedAt'] as string | null | undefined) ?? null,
    updatedAt: input['updatedAt'] as string,
    contentVersion: input['contentVersion'] as number,
  };
}

export function toIndexEntry(p: PreparedProblem, batchId: string, contentHash: string): ProblemIndexEntry {
  return {
    id: p.id,
    topicId: p.topicId,
    slug: p.slug,
    title: p.title,
    type: p.type,
    difficulty: p.difficulty,
    conceptSlugs: p.conceptSlugs,
    sectionId: p.sectionId ?? null,
    tags: p.tags,
    publishedAt: p.publishedAt as string,
    seoEligible: p.seoEligible,
    contentVersion: p.contentVersion,
    batchId,
    contentHash,
    updatedAt: p.updatedAt,
  };
}

export function toPublicSummary(e: ProblemIndexEntry): ProblemSummary {
  return {
    id: e.id,
    topicId: e.topicId,
    slug: e.slug,
    title: e.title,
    type: e.type,
    difficulty: e.difficulty,
    conceptSlugs: e.conceptSlugs,
    sectionId: e.sectionId ?? null,
    tags: e.tags,
    publishedAt: e.publishedAt,
    seoEligible: e.seoEligible,
    contentVersion: e.contentVersion,
  };
}

/** Deterministic index order: publishedAt DESC, then id DESC. */
export function compareSummaries(a: Pick<ProblemSummary, 'publishedAt' | 'id'>, b: Pick<ProblemSummary, 'publishedAt' | 'id'>): number {
  if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

// ---- List query: parsing, cursor, filtering ----

export interface ListFilters {
  difficulty?: ProblemDifficulty;
  concept?: string;
  sectionId?: string;
  tag?: string;
  q?: string;
}

export interface ListQuery {
  limit: number;
  cursor: string | null;
  filters: ListFilters;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const ALLOWED_PARAMS = new Set(['limit', 'cursor', 'difficulty', 'concept', 'sectionId', 'tag', 'q']);

export function normalizeQuery(raw: string): string {
  return raw.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Strictly validates list parameters; any unknown parameter or bad value is a 400. */
export function parseListQuery(params: URLSearchParams, topic: TopicLike): ListQuery {
  for (const key of params.keys()) {
    if (!ALLOWED_PARAMS.has(key)) throw new ApiError(400, 'INVALID_PARAMETER', `Unknown parameter "${key}"`);
  }
  for (const key of ALLOWED_PARAMS) {
    if (params.getAll(key).length > 1) throw new ApiError(400, 'INVALID_PARAMETER', `Parameter "${key}" may appear once`);
  }

  let limit: number = LIMITS.defaultPageSize;
  const rawLimit = params.get('limit');
  if (rawLimit !== null) {
    if (!/^\d{1,3}$/.test(rawLimit)) throw new ApiError(400, 'INVALID_PARAMETER', 'limit must be an integer');
    limit = Number(rawLimit);
    if (limit < 1 || limit > LIMITS.maxPageSize) throw new ApiError(400, 'INVALID_PARAMETER', `limit must be 1-${LIMITS.maxPageSize}`);
  }

  const filters: ListFilters = {};
  const difficulty = params.get('difficulty');
  if (difficulty !== null) {
    if (!PROBLEM_DIFFICULTIES.includes(difficulty as ProblemDifficulty)) throw new ApiError(400, 'INVALID_PARAMETER', 'unknown difficulty');
    filters.difficulty = difficulty as ProblemDifficulty;
  }
  const concept = params.get('concept');
  if (concept !== null) {
    if (!topic.concepts.some((c) => c.slug === concept)) throw new ApiError(400, 'INVALID_PARAMETER', 'unknown concept for this topic');
    filters.concept = concept;
  }
  const sectionId = params.get('sectionId');
  if (sectionId !== null) {
    if (!LIMITS.idPattern.test(sectionId) || !topic.sections?.some((section) => section.id === sectionId && section.active !== false)) {
      throw new ApiError(400, 'INVALID_PARAMETER', 'unknown sectionId for this topic');
    }
    filters.sectionId = sectionId;
  }
  const tag = params.get('tag');
  if (tag !== null) {
    if (!LIMITS.tagPattern.test(tag)) throw new ApiError(400, 'INVALID_PARAMETER', 'invalid tag');
    filters.tag = tag;
  }
  const q = params.get('q');
  if (q !== null) {
    const norm = normalizeQuery(q);
    if (norm === '' || q.length > LIMITS.maxQuery) throw new ApiError(400, 'INVALID_PARAMETER', `q must be 1-${LIMITS.maxQuery} characters`);
    filters.q = norm;
  }

  const cursor = params.get('cursor');
  if (cursor !== null && (cursor === '' || cursor.length > LIMITS.maxCursor)) throw new ApiError(400, 'INVALID_CURSOR', 'invalid cursor');

  return { limit, cursor, filters };
}

export function filterFingerprint(filters: ListFilters): string {
  return JSON.stringify([filters.difficulty ?? '', filters.concept ?? '', filters.sectionId ?? '', filters.tag ?? '', filters.q ?? '']);
}

interface CursorPayload {
  r: string; // release
  p: string; // last item publishedAt
  i: string; // last item id
  f: string; // filter fingerprint
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// The cursor is opaque but not signed: it only encodes a position inside already-public data, so
// tampering cannot reveal anything the client could not list anyway. It is bound to the release and
// the filter set so it cannot be replayed against different results.
export function encodeCursor(release: string, last: Pick<ProblemSummary, 'publishedAt' | 'id'>, filters: ListFilters): string {
  const payload: CursorPayload = { r: release, p: last.publishedAt, i: last.id, f: filterFingerprint(filters) };
  return b64urlEncode(JSON.stringify(payload));
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const parsed = JSON.parse(b64urlDecode(cursor)) as Partial<CursorPayload>;
    if (typeof parsed.r === 'string' && typeof parsed.p === 'string' && typeof parsed.i === 'string' && typeof parsed.f === 'string') {
      return parsed as CursorPayload;
    }
  } catch {
    // fall through
  }
  throw new ApiError(400, 'INVALID_CURSOR', 'invalid cursor');
}

/**
 * Normalised "title + tags" per row, computed once per index array and reused by every later keyword search
 * (immutable release indexes are cached per isolate, so the cost is paid once, not on each request).
 */
const haystackCache = new WeakMap<ProblemIndexEntry[], string[]>();

function haystacks(items: ProblemIndexEntry[]): string[] {
  let cached = haystackCache.get(items);
  if (!cached) {
    cached = items.map((item) => normalizeQuery(`${item.title} ${item.tags.join(' ')}`));
    haystackCache.set(items, cached);
  }
  return cached;
}

function matches(item: ProblemIndexEntry, f: ListFilters, haystack: string | undefined): boolean {
  if (f.difficulty && item.difficulty !== f.difficulty) return false;
  if (f.concept && !item.conceptSlugs.includes(f.concept)) return false;
  if (f.sectionId && item.sectionId !== f.sectionId) return false;
  if (f.tag && !item.tags.includes(f.tag)) return false;
  if (f.q) {
    const text = haystack ?? normalizeQuery(`${item.title} ${item.tags.join(' ')}`);
    for (const token of f.q.split(' ')) if (!text.includes(token)) return false;
  }
  return true;
}

/** Applies filters + keyset cursor to a release index and returns one bounded page. */
export function queryIndex(index: ProblemIndexFile, query: ListQuery): ProblemListResponse {
  let after: Pick<ProblemSummary, 'publishedAt' | 'id'> | null = null;
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    if (c.r !== index.release) throw new ApiError(409, 'CATALOG_VERSION_CHANGED', 'The catalog was updated; restart from the first page');
    if (c.f !== filterFingerprint(query.filters)) throw new ApiError(400, 'INVALID_CURSOR', 'cursor does not match these filters');
    after = { publishedAt: c.p, id: c.i };
  }

  const items: ProblemIndexEntry[] = [];
  let hasMore = false;
  const hay = query.filters.q ? haystacks(index.items) : null;
  for (let n = 0; n < index.items.length; n++) {
    const item = index.items[n];
    if (after && compareSummaries(item, after) <= 0) continue;
    if (!matches(item, query.filters, hay?.[n])) continue;
    if (items.length === query.limit) {
      hasMore = true;
      break;
    }
    items.push(item);
  }
  return {
    items: items.map(toPublicSummary),
    nextCursor: hasMore ? encodeCursor(index.release, items[items.length - 1], query.filters) : null,
    catalogVersion: index.release,
  };
}

/** Projects a stored problem to its public detail DTO (no editorial lifecycle fields). */
export function toPublicDetail(p: PreparedProblem, catalogVersion: string, media: PublicMedia[] = []): PublicProblemDetail {
  const { visibility: _visibility, schemaVersion: _schemaVersion, media: _mediaIds, ...problem } = p;
  return { problem: { ...problem, media }, catalogVersion };
}
