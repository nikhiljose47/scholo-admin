// Copied from nikhiljose47/free-online-tutor packages/community-contracts/src/problem-draft.ts
// at commit 8aa3927cbafd9a1b76f8ce343a4565a727f95d58 -- keep in sync manually.
// Single-problem authoring: the editable shape of a PRIVATE draft and its permissive validation.
//
// A draft is not a second content model. It holds the same fields as `PreparedProblem`, except that the
// parts an author finishes later (answer, explanation, difficulty, concepts, source, ...) may be missing. The
// server adds identity, revision, timestamps, visibility and storage keys; the browser never supplies them.
//
// Two profiles on purpose:
//   - `validateDraftFields`  permissive about COMPLETENESS, strict about SAFETY and SIZE (this file).
//   - publish                the unchanged strict `validatePreparedProblem` plus the import safety/rights checks
//                            (content-api admin-library), so a draft can never publish anything bulk import would refuse.
import { DIAGRAM_LIMITS, validateDiagramSpec } from './diagram-spec';
import { MEDIA_ID_PATTERN, MEDIA_LIMITS } from './media';
import {
  LIMITS,
  PROBLEM_DIFFICULTIES,
  PROBLEM_SOURCE_TYPES,
  PROBLEM_TYPES,
  normalizeTag,
  type McqOption,
  type ProblemDifficulty,
  type ProblemSource,
  type ProblemType,
  type RichText,
  type TopicLike,
  type ValidationResult,
} from './problem-library';

export interface DraftFields {
  title: string;
  slug: string | null;
  type: ProblemType;
  difficulty: ProblemDifficulty | null;
  conceptSlugs: string[];
  tags: string[];
  statement: RichText;
  answer: RichText | null;
  explanation: RichText | null;
  options: McqOption[] | null;
  diagrams: unknown[];
  media: string[];
  source: ProblemSource | null;
  seoEligible: boolean;
}

/** The only keys a client may send. Everything else (id, topic, revision, visibility, keys, uid) is server-owned. */
export const DRAFT_FIELD_KEYS = [
  'title', 'slug', 'type', 'difficulty', 'conceptSlugs', 'tags', 'statement', 'answer',
  'explanation', 'options', 'diagrams', 'media', 'source', 'seoEligible',
] as const;

export const DRAFT_LIMITS = {
  /** Drafts shown per page of the Drafts tab. */
  pageSize: 50,
  /** A published explanation must say something. Applies to the single-problem publish path. */
  minExplanationChars: 15,
  maxAttribution: 300,
  maxLicense: 300,
  maxIdempotencyKey: 100,
} as const;

export const DRAFT_ID_PATTERN = /^p-[0-9a-f]{24}$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Optional rich text: absent, null or whitespace-only all mean "not written yet"; anything else must be bounded and typed. */
function optionalRichText(v: unknown, field: string, max: number, errors: string[]): RichText | null {
  if (v === null || v === undefined) return null;
  if (!isObject(v)) {
    errors.push(`${field} must be an object {format, text} or null`);
    return null;
  }
  if (v['format'] !== 'markdown' && v['format'] !== 'latex' && v['format'] !== 'text') {
    errors.push(`${field}.format must be markdown, latex or text`);
    return null;
  }
  if (typeof v['text'] !== 'string') {
    errors.push(`${field}.text must be a string`);
    return null;
  }
  if (v['text'].trim() === '') return null;
  if (v['text'].length > max) {
    errors.push(`${field}.text exceeds ${max} characters`);
    return null;
  }
  return { format: v['format'], text: v['text'] };
}

/**
 * Validates and normalizes untrusted draft fields. Returns an allow-listed copy. Missing completeness is fine;
 * oversize, malformed, unknown-topic, wrong-type and unsafe structure are not, even for a draft.
 */
export function validateDraftFields(input: unknown, topic: TopicLike): ValidationResult<DraftFields> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ['fields must be an object'] };

  const unknown = Object.keys(input).filter((k) => !(DRAFT_FIELD_KEYS as readonly string[]).includes(k));
  if (unknown.length) errors.push(`unknown field(s): ${unknown.slice(0, 5).join(', ')}`);

  const title = input['title'];
  if (typeof title !== 'string' || title.trim() === '') errors.push('title is required');
  else if (title.length > LIMITS.maxTitle) errors.push(`title exceeds ${LIMITS.maxTitle} characters`);

  if (!PROBLEM_TYPES.includes(input['type'] as ProblemType)) errors.push(`type must be one of ${PROBLEM_TYPES.join(', ')}`);

  const slug = input['slug'];
  if (slug !== null && slug !== undefined && slug !== '' && (typeof slug !== 'string' || !LIMITS.slugPattern.test(slug))) {
    errors.push('slug must be lowercase letters, digits and hyphens (or left empty to generate one)');
  }

  const difficulty = input['difficulty'];
  if (difficulty !== null && difficulty !== undefined && !PROBLEM_DIFFICULTIES.includes(difficulty as ProblemDifficulty)) {
    errors.push(`difficulty must be one of ${PROBLEM_DIFFICULTIES.join(', ')} (or empty)`);
  }

  const conceptsIn = input['conceptSlugs'] ?? [];
  const conceptSlugs: string[] = [];
  if (!Array.isArray(conceptsIn) || conceptsIn.length > LIMITS.maxConcepts) {
    errors.push(`conceptSlugs must be an array of at most ${LIMITS.maxConcepts} slugs`);
  } else {
    for (const c of conceptsIn) {
      if (typeof c !== 'string' || !topic.concepts.some((tc) => tc.slug === c)) errors.push(`conceptSlugs contains "${String(c).slice(0, 40)}", which is not a concept of ${topic.id}`);
      else if (!conceptSlugs.includes(c)) conceptSlugs.push(c);
    }
  }

  const tagsIn = input['tags'] ?? [];
  const tags: string[] = [];
  if (!Array.isArray(tagsIn) || tagsIn.length > LIMITS.maxTags) errors.push(`tags must be an array of at most ${LIMITS.maxTags}`);
  else {
    for (const raw of tagsIn) {
      const t = typeof raw === 'string' ? normalizeTag(raw) : '';
      if (!LIMITS.tagPattern.test(t)) errors.push(`tag "${String(raw).slice(0, 40)}" must be letters, digits and hyphens (max 30)`);
      else if (!tags.includes(t)) tags.push(t);
    }
  }

  const statementRaw = input['statement'];
  const statement = optionalRichText(statementRaw, 'statement', LIMITS.maxStatement, errors);
  if (!statement && !errors.some((e) => e.startsWith('statement'))) errors.push('statement is required');

  const answer = optionalRichText(input['answer'], 'answer', LIMITS.maxAnswer, errors);
  const explanation = optionalRichText(input['explanation'], 'explanation', LIMITS.maxExplanation, errors);

  const optionsIn = input['options'];
  let options: McqOption[] | null = null;
  if (optionsIn !== null && optionsIn !== undefined) {
    if (input['type'] !== 'mcq') errors.push('options must be empty unless type is mcq');
    else if (!Array.isArray(optionsIn) || optionsIn.length > LIMITS.maxOptions) errors.push(`options must be an array of at most ${LIMITS.maxOptions}`);
    else {
      const out: McqOption[] = [];
      const ids = new Set<string>();
      for (const [i, o] of optionsIn.entries()) {
        if (!isObject(o) || typeof o['id'] !== 'string' || !/^[A-Za-z0-9_-]{1,16}$/.test(o['id'])) {
          errors.push(`options[${i}].id must be 1-16 letters, digits, - or _`);
          continue;
        }
        if (typeof o['text'] !== 'string' || o['text'].length > LIMITS.maxOptionText) {
          errors.push(`options[${i}].text must be text of at most ${LIMITS.maxOptionText} characters`);
          continue;
        }
        const note = o['explanation'];
        if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > LIMITS.maxOptionText)) {
          errors.push(`options[${i}].explanation must be text of at most ${LIMITS.maxOptionText} characters`);
          continue;
        }
        if (ids.has(o['id'])) errors.push(`options[${i}].id "${o['id']}" is used twice`);
        ids.add(o['id']);
        out.push({ id: o['id'], text: o['text'], ...(typeof note === 'string' && note.trim() !== '' ? { explanation: note } : {}) });
      }
      options = out;
    }
  }

  const diagramsIn = input['diagrams'] ?? [];
  const diagrams: unknown[] = [];
  if (!Array.isArray(diagramsIn) || diagramsIn.length > DIAGRAM_LIMITS.maxPerProblem) {
    errors.push(`diagrams must be an array of at most ${DIAGRAM_LIMITS.maxPerProblem} diagram specs`);
  } else {
    diagramsIn.forEach((d, i) => {
      const r = validateDiagramSpec(d);
      if (r.ok) diagrams.push(d);
      else for (const e of r.errors) errors.push(`diagrams[${i}].${e}`);
    });
  }

  const mediaIn = input['media'] ?? [];
  const media: string[] = [];
  if (!Array.isArray(mediaIn) || mediaIn.length > MEDIA_LIMITS.maxPerProblem) {
    errors.push(`media must be an array of at most ${MEDIA_LIMITS.maxPerProblem} media ids`);
  } else {
    for (const m of mediaIn) {
      if (typeof m !== 'string' || !MEDIA_ID_PATTERN.test(m)) errors.push(`media id "${String(m).slice(0, 40)}" is not valid (expected m- followed by 20 hex characters from an upload)`);
      else if (!media.includes(m)) media.push(m);
    }
  }

  const sourceIn = input['source'];
  let source: ProblemSource | null = null;
  if (sourceIn !== null && sourceIn !== undefined) {
    if (!isObject(sourceIn) || !PROBLEM_SOURCE_TYPES.includes(sourceIn['type'] as never)) errors.push(`source.type must be one of ${PROBLEM_SOURCE_TYPES.join(', ')}`);
    else if (typeof sourceIn['license'] !== 'string' || sourceIn['license'].length > DRAFT_LIMITS.maxLicense) errors.push(`source.license must be text of at most ${DRAFT_LIMITS.maxLicense} characters`);
    else if (sourceIn['attribution'] !== null && sourceIn['attribution'] !== undefined && (typeof sourceIn['attribution'] !== 'string' || sourceIn['attribution'].length > DRAFT_LIMITS.maxAttribution)) {
      errors.push(`source.attribution must be text of at most ${DRAFT_LIMITS.maxAttribution} characters`);
    } else {
      const attribution = typeof sourceIn['attribution'] === 'string' && sourceIn['attribution'].trim() !== '' ? sourceIn['attribution'] : null;
      source = { type: sourceIn['type'] as ProblemSource['type'], attribution, license: sourceIn['license'] };
    }
  }

  const seo = input['seoEligible'];
  if (seo !== undefined && typeof seo !== 'boolean') errors.push('seoEligible must be true or false');

  if (errors.length) return { ok: false, errors };
  const value: DraftFields = {
    title: (title as string).trim(),
    slug: typeof slug === 'string' && slug !== '' ? slug : null,
    type: input['type'] as ProblemType,
    difficulty: (difficulty as ProblemDifficulty | null | undefined) ?? null,
    conceptSlugs,
    tags,
    statement: statement as RichText,
    answer,
    explanation,
    options,
    diagrams,
    media,
    source,
    seoEligible: seo === true,
  };
  if (JSON.stringify(value).length > LIMITS.maxItemBytes) return { ok: false, errors: [`draft exceeds ${LIMITS.maxItemBytes} bytes`] };
  return { ok: true, value };
}

/** Publish-time completeness errors that the strict validator reports in generic words; named per field for the editor. */
export function friendlyPublishMessage(message: string): string {
  if (message.startsWith('answer must be an object')) return 'answer is required to publish';
  if (message.startsWith('explanation must be an object')) return 'explanation is required to publish';
  if (message.startsWith('difficulty must be')) return 'difficulty is required to publish';
  if (message.startsWith('conceptSlugs must be an array of 1-')) return 'conceptSlugs needs at least one concept to publish';
  if (message === 'source is required (provenance)') return 'source is required to publish (where does this problem come from, and under what licence?)';
  return message;
}
