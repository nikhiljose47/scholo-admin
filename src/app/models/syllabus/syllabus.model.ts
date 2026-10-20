export interface SyllabusIndex {
  version: string;
  catalog?: SyllabusCatalogEntry[];
  /** Legacy shape, kept as a fallback. */
  classes?: SyllabusIndexEntry[];
}

export interface SyllabusIndexEntry {
  classId: string;
  className: string;
  file: string;
}

export interface ClassSyllabus {
  classId: string;
  className: string;
  code_prefix: string;
  syllabus_year?: string;
  subjects: Subject[];
}

export interface Subject {
  name: string;
  code: string;
  enabled?: boolean;
  chapters: Chapter[];
}

/** One entry of the live index's `catalog` array (classes, exams and activities). */
export interface SyllabusCatalogEntry {
  id: string;
  type: string;
  title: string;
  enabled?: boolean;
  file?: string;
}

export interface Chapter {
  code: string;
  name: string;
  enabled?: boolean;
  agenda?: string[];
  session_instructions?: { type: string; text: string }[];
  teacher_aids?: string[];
  divisions: Division[];
  resources?: unknown[];
}

export interface Division {
  code: string;
  name: string;
  difficulty_level: 'easy' | 'medium' | 'hard';
  time_estimate_min: number;
  meta?: {
    nature?: string;
    exam_weight?: string;
  };
}

export interface PuzzlesIndex {
  version: string;
  files: { classId: string; file: string }[];
}

export interface ClassPuzzles {
  classId: string;
  className: string;
  board?: string;
  subject?: string;
  chapters: PuzzleChapter[];
}

export interface PuzzleChapter {
  id: string;
  chapterName: string;
  theory: { title: string; content: string[] }[];
  puzzles: Puzzle[];
}

export interface Puzzle {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanations: string[];
}
