# Problem Library section linking

`sectionId` is an optional, canonical learning-section identifier on a Problem
Library item. It is separate from `conceptSlugs`; never put numbers such as
`1.1` in `conceptSlugs`.

## Admin contract now represented in this repository

Draft create/save requests may include:

```json
{
  "topicId": "topic-polynomials",
  "fields": {
    "title": "Identify the degree",
    "type": "short_answer",
    "difficulty": "foundation",
    "conceptSlugs": ["read-the-language"],
    "sectionId": "section-poly-1-1",
    "tags": ["degree", "polynomials"],
    "statement": { "format": "text", "text": "What is the degree of 7x³ − 2x + 1?" }
  }
}
```

Published items, list summaries, index entries, and public detail responses
may expose `sectionId: string | null`. Old records without the property remain
valid and are treated as unlinked.

CSV import accepts an optional `sectionId` column. JSON import accepts the same
optional field directly on each item.

## Section registry

The admin selector reads `COMMUNITY_SECTION_REGISTRY` in
`src/app/features/community-content/community.models.ts`. It is intentionally
empty until stable section data comes from the canonical syllabus. Populate it
with verified entries only:

```ts
{
  id: 'section-poly-1-1',
  number: '1.1',
  groupNumber: '1',
  title: 'Reading a polynomial',
  sortOrder: 101,
  active: true,
}
```

## Required Worker work outside this repository

The deployed Worker source and its storage handlers are not present here. Before
enabling the selector with real data, it must:

1. Load the same per-topic section registry as the admin app.
2. Reject a non-null `sectionId` that is absent, inactive, or belongs to another topic.
3. Persist `sectionId` in drafts, staged imports, published item JSON, and the release index.
4. Project it into public summaries and detail responses.
5. Accept `sectionId` on the public list endpoint, include it in the cursor filter fingerprint, and reject stale/mismatched cursors exactly as existing filters do.
6. If admin draft filtering is implemented, validate and apply `sectionId` while preserving the existing draft cursor semantics.

Do not deploy the public `sectionId` query parameter until the Worker changes are
live. The current admin app intentionally does not send that unverified filter.
