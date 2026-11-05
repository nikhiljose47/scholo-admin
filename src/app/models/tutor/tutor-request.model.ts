import { Timestamp } from '@angular/fire/firestore';

export type TutorRequestStatus = 'notified' | 'scheduled' | 'resolved';

/** Source of truth for the student app's "Chat with tutor" button — written by the student
 *  on submit (`status: 'notified'` only), and by admin/teacher here to move it to `'scheduled'`
 *  / `'resolved'`, or reopen it back to `'notified'`. Doc id is `{studentUid}_{classId}_{chapterCode}`.
 *  The student-app Firestore rules are the actual enforcement of who can set what. */
export interface TutorRequest {
  id: string;
  studentId: string;
  classId: string;
  chapterCode: string;
  status: TutorRequestStatus;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
}
