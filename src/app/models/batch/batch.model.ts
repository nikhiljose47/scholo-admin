import { Timestamp } from '@angular/fire/firestore';

export type BatchStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';
export type SectionProgressStatus = 'not_started' | 'in_progress' | 'completed';

/** Batch — centers/{centerId}/batches/{batchId} */
export interface BatchDoc {
  batchId: string;
  centerId: string;
  name: string;
  classId: string;
  subjectCode: string;
  syllabusVersion: string;
  teacherUids: string[];
  leadTeacherUid?: string;
  status: BatchStatus;
  academicYear: string;
  startDate?: Timestamp;
  endDate?: Timestamp;
  timezone: string;
  capacity?: number;
  enrolledCount: number;
  recordType: 'center_batch';
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

/** Plan chapter — .../planChapters/{chapterInstanceId} */
export interface PlanChapterDoc {
  chapterInstanceId: string;
  batchId: string;
  centerId: string;
  canonicalChapterCode?: string;
  isCustom: boolean;
  title: string;
  order: number;
  active: boolean;
  createdAt: Timestamp;
  createdBy: string;
}

/** Plan section/item — .../planItems/{sectionInstanceId} */
export interface PlanItemDoc {
  sectionInstanceId: string;
  chapterInstanceId: string;
  batchId: string;
  centerId: string;
  canonicalDivisionCode?: string;
  isCustom: boolean;
  title: string;
  order: number;
  active: boolean;
  progress: {
    status: SectionProgressStatus;
    updatedAt: Timestamp;
    updatedBy: string;
    plannedDate?: Timestamp;
    actualDate?: Timestamp;
    estimatedMinutes?: number;
  };
  createdAt: Timestamp;
  createdBy: string;
}

/** Progress event — .../progressEvents/{eventId} — append-only */
export interface ProgressEventDoc {
  eventId: string;
  sectionInstanceId: string;
  batchId: string;
  centerId: string;
  actorUid: string;
  fromStatus: SectionProgressStatus;
  toStatus: SectionProgressStatus;
  note?: string;
  recordedAt: Timestamp;
}

/** Enrollment — .../enrollments/{studentUid} */
export interface EnrollmentDoc {
  studentUid: string;
  batchId: string;
  centerId: string;
  enrolledAt: Timestamp;
  enrolledBy: string;
  active: boolean;
}

/** Audit event — centers/{centerId}/auditEvents/{eventId} — append-only, restricted */
export interface AuditEventDoc {
  eventId: string;
  centerId: string;
  batchId?: string;
  actorUid: string;
  action: string;
  targetPath: string;
  previousValue?: unknown;
  newValue?: unknown;
  recordedAt: Timestamp;
}

/** Batch summary — .../summaries/current */
export interface BatchSummaryDoc {
  batchId: string;
  totalSections: number;
  completedSections: number;
  inProgressSections: number;
  completionPercent: number;
  lastUpdated: Timestamp;
}
