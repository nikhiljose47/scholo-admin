import { Timestamp } from '@angular/fire/firestore';

export interface SessionImportRow {
  studentId: string;
  assignmentMarks: number;
  maxMarks: number;
  engagementScore: number;
  remarks: string;
}

export interface StudentSessionResult {
  studentUid: string;
  studentId: string | null;
  sessionId: string;
  subjectId: string;
  chapterCode: string;
  divisionCode: string;
  sessionType: 'class' | string;
  testType?: 'weekly' | 'chapter' | 'monthly' | 'mock' | 'final' | 'daily';
  assignmentMarks: number;
  maxMarks: number;
  engagementScore: number;
  remarks: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface RosterEntry {
  uid: string;
  name: string;
  email: string;
}
