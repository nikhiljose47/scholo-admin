// Copied from nikhiljose47/free-online-tutor packages/community-contracts/src/problem-import.ts
// at commit 8aa3927cbafd9a1b76f8ce343a4565a727f95d58 -- keep in sync manually.
// Bulk-import parsing and per-row checks for the Problem Library. Pure TypeScript (WebCrypto only).
import {
  LIMITS,
  normalizeTag,
  type PreparedProblem,
  type RichText,
} from './problem-library';

export const IMPORT_LIMITS = {
  /** Items per staged batch. Each valid item is one R2 write, so this bounds subrequests per request. */
  maxItems: 200,
  maxBytes: 3_000_000,
  maxReportedErrors: 100,
  maxBatchesPerPublish: 25,
} as const;

export const ALLOWED_OPEN_LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'public-domain'] as const;
export const ORIGINAL_LICENSE = 'Scholo original';

export interface RowError {
  row: number;
  field: string;
  message: string;
}

export interface ImportRow {
  /** 1-based position in the file (CSV: data row number after the header). */
  row: number;
  input: unknown;
}

// ---- CSV (RFC 4180: quoted fields, escaped quotes, embedded commas/newlines, BOM, CRLF) ----

export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i++;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      i++;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  if (inQuotes) throw new Error('CSV has an unterminated quoted field');
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

export const CSV_COLUMNS = [
  'externalId', 'slug', 'type', 'difficulty', 'title', 'statement', 'answer', 'explanation',
  'conceptSlugs', 'sectionId', 'tags', 'options', 'diagrams', 'media', 'sourceType', 'attribution', 'license', 'seoEligible',
] as const;
const REQUIRED_CSV_COLUMNS = ['externalId', 'type', 'difficulty', 'title', 'statement', 'answer', 'explanation', 'conceptSlugs', 'sourceType', 'license'];

function splitList(v: string): string[] {
  return v.split(/[|;]/).map((s) => s.trim()).filter(Boolean);
}

export function slugify(title: string): string {
  const s = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return s || 'problem';
}

/** Turns CSV text into import rows. Throws a clear Error for structural problems (the whole file is unusable). */
export function csvToRows(text: string): ImportRow[] {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error('CSV is empty');
  const header = table[0].map((h) => h.trim());
  const unknown = header.filter((h) => !(CSV_COLUMNS as readonly string[]).includes(h));
  if (unknown.length) throw new Error(`Unknown CSV column(s): ${unknown.join(', ')}. Expected: ${CSV_COLUMNS.join(', ')}`);
  const missing = REQUIRED_CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`Missing required CSV column(s): ${missing.join(', ')}`);

  return table.slice(1).map((cells, i) => {
    const get = (name: string): string => {
      const idx = header.indexOf(name);
      return idx >= 0 ? (cells[idx] ?? '').trim() : '';
    };
    const raw = (name: string): string => {
      const idx = header.indexOf(name);
      return idx >= 0 ? (cells[idx] ?? '') : '';
    };
    const row = i + 1;
    if (cells.length > header.length) {
      return { row, input: { __csvError: `row has ${cells.length} cells but the header has ${header.length}` } };
    }
    const type = get('type');
    const text = (field: string, fmt: RichText['format']): RichText => ({ format: fmt, text: raw(field).trim() });
    let options: unknown = null;
    const optionsRaw = get('options');
    if (optionsRaw !== '') {
      try {
        options = JSON.parse(optionsRaw);
      } catch {
        return { row, input: { __csvError: 'options must be valid JSON, e.g. [{"id":"a","text":"..."}]' } };
      }
    }
    let diagrams: unknown = [];
    const diagramsRaw = get('diagrams');
    if (diagramsRaw !== '') {
      try {
        const parsed: unknown = JSON.parse(diagramsRaw);
        diagrams = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return { row, input: { __csvError: 'diagrams must be valid JSON (one DiagramSpec object or an array of them)' } };
      }
    }
    const attribution = get('attribution');
    return {
      row,
      input: {
        id: get('externalId'),
        slug: get('slug') || undefined,
        type,
        difficulty: get('difficulty'),
        title: get('title'),
        statement: text('statement', 'markdown'),
        answer: text('answer', type === 'mcq' ? 'text' : 'markdown'),
        explanation: text('explanation', 'markdown'),
        conceptSlugs: splitList(get('conceptSlugs')),
        sectionId: get('sectionId') || null,
        tags: splitList(get('tags')).map(normalizeTag),
        options,
        diagrams,
        media: splitList(get('media')),
        source: { type: get('sourceType'), attribution: attribution === '' ? null : attribution, license: get('license') },
        seoEligible: get('seoEligible').toLowerCase() === 'true',
      },
    };
  });
}

/** JSON import: either an array of problems or `{ "problems": [...] }`. */
export function jsonToRows(text: string): ImportRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    throw new Error('File is not valid JSON');
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { problems?: unknown } | null)?.problems;
  if (!Array.isArray(list)) throw new Error('JSON must be an array of problems or an object with a "problems" array');
  return list.map((input, i) => ({ row: i + 1, input }));
}

// ---- Safety and provenance checks ----

// Every quantifier is bounded so hostile input (e.g. thousands of "<" with no ">") cannot cause quadratic scans.
const UNSAFE_PATTERNS: Array<[RegExp, string]> = [
  [/<\s{0,10}(script|iframe|object|embed|style|link|meta|base|form|svg|math)\b/i, 'contains a disallowed HTML tag'],
  [/\bjavascript\s{0,10}:/i, 'contains a javascript: URL'],
  [/java(?:&#x?[0-9a-f]{1,8};?|[\s\u0000-\u001f]){0,20}script(?:&#x?[0-9a-f]{1,8};?|[\s\u0000-\u001f]){0,20}(?::|&colon;|&#0*58;|&#x0*3a;)/i, 'contains an obfuscated javascript: URL'],
  [/\bdata\s{0,10}:\s{0,10}text\/html/i, 'contains an HTML data: URL'],
  [/<[^>]{0,500}[\s/"']on\w{1,30}\s{0,10}=/i, 'contains an inline event handler'],
];

/** Only this much of any field is scanned; the structural limits reject anything longer before it matters. */
const SCAN_LIMIT = 20_000;

/** Heuristic import-time rejection of obviously unsafe free-form text. Display-time sanitising is separate (Phase 6). */
export function findUnsafeContent(p: Pick<PreparedProblem, 'title' | 'statement' | 'answer' | 'explanation' | 'options'>): RowError['message'][] {
  const fields: Array<[string, string]> = [
    ['title', p.title ?? ''],
    ['statement.text', p.statement?.text ?? ''],
    ['answer.text', p.answer?.text ?? ''],
    ['explanation.text', p.explanation?.text ?? ''],
  ];
  if (Array.isArray(p.options)) {
    for (const [i, o] of p.options.entries()) {
      fields.push([`options[${i}].text`, o?.text ?? ''], [`options[${i}].explanation`, o?.explanation ?? '']);
    }
  }
  const out: string[] = [];
  for (const [name, value] of fields) {
    for (const [re, why] of UNSAFE_PATTERNS) if (typeof value === 'string' && re.test(value.slice(0, SCAN_LIMIT))) out.push(`${name} ${why}`);
  }
  return out;
}

/** Rights check: only original Scholo work, open licences, or documented permission are accepted. */
export function checkProvenance(source: PreparedProblem['source'] | undefined): string[] {
  if (!source) return ['source is required'];
  if (source.type === 'original') {
    return source.license === ORIGINAL_LICENSE ? [] : [`original work must use the license "${ORIGINAL_LICENSE}"`];
  }
  if (source.type === 'licensed') {
    return (ALLOWED_OPEN_LICENSES as readonly string[]).includes(source.license)
      ? []
      : [`license "${source.license}" is not accepted; allowed: ${ALLOWED_OPEN_LICENSES.join(', ')}`];
  }
  if (source.type === 'permission') {
    return source.license.trim().length >= 10 ? [] : ['describe the documented permission in license (at least 10 characters)'];
  }
  return [];
}

// ---- Canonical hashing for duplicate / unchanged detection ----

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, canonicalize(v)]));
  }
  return value;
}

export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash of the editorial content only: excludes lifecycle/timestamps/version so re-imports of identical content match. */
export async function contentHash(p: PreparedProblem): Promise<string> {
  const { schemaVersion: _s, visibility: _v, publishedAt: _p, updatedAt: _u, contentVersion: _c, ...editorial } = p;
  return (await sha256Hex(JSON.stringify(canonicalize(editorial)))).slice(0, 16);
}

export function titleKey(title: string): string {
  return title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export const EDITABLE_FIELDS = [
  'title', 'slug', 'type', 'difficulty', 'conceptSlugs', 'sectionId', 'tags', 'statement', 'answer',
  'explanation', 'options', 'diagrams', 'media', 'source', 'seoEligible',
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export { LIMITS };
