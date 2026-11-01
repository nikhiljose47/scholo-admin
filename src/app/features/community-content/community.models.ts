// Copied from nikhiljose47/free-online-tutor src/app/features/communities/community.models.ts
// at commit 8aa3927cbafd9a1b76f8ce343a4565a727f95d58 — keep in sync with that repo manually,
// the content-api rejects unknown topics/concepts regardless of what this file lists.
// SINGLE SOURCE OF TRUTH for topic ids and concept slugs. Also imported by apps/course-chat-worker
// (room allowlist + concept validation), so keep this file free of Angular/browser imports.
export type TopicStatus = 'draft' | 'published' | 'archived';
export type CommunityTab =
  | 'overview'
  | 'learn'
  | 'discussion'
  | 'library'
  | 'problems'
  | 'workbook'
  | 'practice'
  | 'ai'
  | 'teacher-help';

export interface CommunityConcept {
  /** Stable slug used as the discussion-post concept tag. Validated by the Worker, which derives its allowlist from this file. */
  slug: string;
  title: string;
  description: string;
  difficulty: 'foundation' | 'core' | 'advanced';
}

export interface CommunityTopic {
  id: string;
  subjectId: string;
  subjectName: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  themeKey: 'violet' | 'cobalt' | 'amber' | 'teal' | 'coral';
  status: TopicStatus;
  synonyms: string[];
  concepts: CommunityConcept[];
  starterPrompt: string;
}

export const COMMUNITY_TABS: Array<{ id: CommunityTab; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'compass' },
  { id: 'learn', label: 'Learning path', icon: 'list-ol' },
  { id: 'problems', label: 'Problem Library', icon: 'collection' },
  { id: 'discussion', label: 'Discussion', icon: 'chat-square-text' },
  { id: 'library', label: 'Library', icon: 'bookshelf' },
  { id: 'workbook', label: 'Workbook', icon: 'journal-text' },
  { id: 'practice', label: 'Practice', icon: 'check2-circle' },
  { id: 'ai', label: 'AI Tutor', icon: 'stars' },
  { id: 'teacher-help', label: 'Teacher Help', icon: 'person-raised-hand' },
];

export const COMMUNITY_TOPICS: CommunityTopic[] = [
  {
    id: 'topic-polynomials',
    subjectId: 'mathematics',
    subjectName: 'Mathematics',
    slug: 'polynomials',
    title: 'Polynomials',
    summary: 'Expressions, degree, zeros, operations and factorisation.',
    description: 'Build a confident feel for expressions, patterns and the algebra behind them.',
    themeKey: 'violet',
    status: 'published',
    synonyms: ['algebra', 'factorisation', 'factors', 'zeros', 'expressions'],
    concepts: [
      { slug: 'read-the-language', title: 'Read the language', description: 'Terms, coefficients, degree and standard form.', difficulty: 'foundation' },
      { slug: 'operate-with-confidence', title: 'Operate with confidence', description: 'Add, subtract and multiply without losing structure.', difficulty: 'core' },
      { slug: 'factor-and-solve', title: 'Factor and solve', description: 'Connect factors, zeros and useful identities.', difficulty: 'advanced' },
    ],
    starterPrompt: 'What is the difference between a term and a coefficient?',
  },
  {
    id: 'topic-trigonometry',
    subjectId: 'mathematics',
    subjectName: 'Mathematics',
    slug: 'trigonometry',
    title: 'Trigonometry',
    summary: 'Triangles, ratios, identities and the shape of real-world change.',
    description: 'See how angles and ratios turn measurements into a language for the world around us.',
    themeKey: 'cobalt',
    status: 'published',
    synonyms: ['triangles', 'sin', 'cos', 'tan', 'angles'],
    concepts: [
      { slug: 'meet-the-ratios', title: 'Meet the ratios', description: 'Understand sine, cosine and tangent in right triangles.', difficulty: 'foundation' },
      { slug: 'read-a-triangle', title: 'Read a triangle', description: 'Use angles and sides to find what is missing.', difficulty: 'core' },
      { slug: 'use-identities', title: 'Use identities', description: 'Move between equivalent forms with purpose.', difficulty: 'advanced' },
    ],
    starterPrompt: 'When should you choose sine, cosine or tangent?',
  },
  {
    id: 'topic-motion',
    subjectId: 'physics',
    subjectName: 'Physics',
    slug: 'motion',
    title: 'Motion',
    summary: 'Distance, speed, graphs and the forces that change movement.',
    description: 'Turn everyday movement into clear diagrams, measurements and explanations.',
    themeKey: 'amber',
    status: 'published',
    synonyms: ['speed', 'velocity', 'acceleration', 'graphs', 'force'],
    concepts: [
      { slug: 'describe-movement', title: 'Describe movement', description: 'Separate distance, displacement, speed and velocity.', difficulty: 'foundation' },
      { slug: 'read-the-graph', title: 'Read the graph', description: 'Find stories hidden in distance–time and velocity–time graphs.', difficulty: 'core' },
      { slug: 'explain-the-change', title: 'Explain the change', description: 'Connect acceleration with force and mass.', difficulty: 'advanced' },
    ],
    starterPrompt: 'What can the slope of a distance–time graph tell you?',
  },
  {
    id: 'topic-electricity',
    subjectId: 'physics',
    subjectName: 'Physics',
    slug: 'electricity',
    title: 'Electricity',
    summary: 'Current, voltage, resistance, circuits and power.',
    description: 'Trace what energy is doing in a circuit, from the first connection to the final result.',
    themeKey: 'teal',
    status: 'published',
    synonyms: ['circuits', 'current', 'voltage', 'resistance', 'power'],
    concepts: [
      { slug: 'build-the-picture', title: 'Build the picture', description: 'Understand charge, current and potential difference.', difficulty: 'foundation' },
      { slug: 'solve-circuits', title: 'Solve circuits', description: 'Use resistance and Ohm’s law to predict behavior.', difficulty: 'core' },
      { slug: 'track-energy', title: 'Track energy', description: 'Connect power, household electricity and safety.', difficulty: 'advanced' },
    ],
    starterPrompt: 'What does a battery provide to a circuit?',
  },
  {
    id: 'topic-chemical-reactions',
    subjectId: 'chemistry',
    subjectName: 'Chemistry',
    slug: 'chemical-reactions',
    title: 'Chemical Reactions',
    summary: 'Particles, equations, energy changes and useful reactions.',
    description: 'Learn to spot what changes, what stays conserved and how chemists describe it.',
    themeKey: 'coral',
    status: 'published',
    synonyms: ['chemistry', 'equations', 'reactants', 'products', 'reactions'],
    concepts: [
      { slug: 'notice-the-change', title: 'Notice the change', description: 'Identify reactants, products and evidence of reaction.', difficulty: 'foundation' },
      { slug: 'balance-the-story', title: 'Balance the story', description: 'Use conservation of atoms to balance equations.', difficulty: 'core' },
      { slug: 'explain-the-energy', title: 'Explain the energy', description: 'Connect bonds, heat and reaction conditions.', difficulty: 'advanced' },
    ],
    starterPrompt: 'Why must a chemical equation be balanced?',
  },
  {
    id: 'topic-engineering-mechanics',
    subjectId: 'engineering',
    subjectName: 'Engineering',
    slug: 'engineering-mechanics',
    title: 'Engineering Mechanics',
    summary: 'Forces, equilibrium, trusses and the statics behind structures.',
    description: 'Learn to see forces at work in beams, trusses and machines, and reason about why structures hold.',
    themeKey: 'cobalt',
    status: 'published',
    synonyms: ['statics', 'dynamics', 'forces', 'trusses', 'equilibrium'],
    concepts: [
      { slug: 'resolve-the-forces', title: 'Resolve the forces', description: 'Break forces into components and find resultants.', difficulty: 'foundation' },
      { slug: 'balance-the-structure', title: 'Balance the structure', description: 'Apply equilibrium conditions to beams and trusses.', difficulty: 'core' },
      { slug: 'analyze-the-motion', title: 'Analyze the motion', description: 'Connect mass, forces and acceleration in rigid bodies.', difficulty: 'advanced' },
    ],
    starterPrompt: 'What does it mean for a structure to be in equilibrium?',
  },
];

export function getPublishedCommunityTopics(): CommunityTopic[] {
  return COMMUNITY_TOPICS.filter((topic) => topic.status === 'published');
}

export function findCommunityTopic(subjectSlug: string, topicSlug: string): CommunityTopic | null {
  return (
    getPublishedCommunityTopics().find(
      (topic) => topic.subjectId === subjectSlug && topic.slug === topicSlug,
    ) ?? null
  );
}

export function isCommunityTab(value: string | null): value is CommunityTab {
  return COMMUNITY_TABS.some((tab) => tab.id === value);
}
