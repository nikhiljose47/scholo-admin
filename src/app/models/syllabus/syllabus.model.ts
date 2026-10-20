export interface SyllabusIndex {
  version: string;
  classes: SyllabusIndexEntry[];
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

export interface Chapter {
  code: string;
  name: string;
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
