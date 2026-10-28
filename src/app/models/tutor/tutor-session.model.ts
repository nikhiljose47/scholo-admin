import { Timestamp } from '@angular/fire/firestore';

export type TutorSessionStatus = 'scheduled' | 'ongoing' | 'completed' | 'cancelled';

/** The write path behind the student app's "Chat with tutor" bell notification and
 *  /notifications page — those surfaces only ever read this collection; this admin
 *  page is what creates and updates it.
 *  `seenBy` MUST start as `[]` on create, and MUST be reset to `[]` whenever
 *  `scheduledAt` or `meetLink` changes, so the student is re-notified. */
export interface TutorSession {
  id: string;
  studentIds: string[];
  teacherId: string;
  teacherName: string;
  meetLink: string;
  scheduledAt: Timestamp;
  durationMinutes: number;
  status: TutorSessionStatus;
  classId?: string;
  chapterCode?: string;
  title?: string;
  message?: string;
  /** tutor_requests id(s) this session answers — also how a request is marked "handled". */
  requestIds?: string[];
  seenBy: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
