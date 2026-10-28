import { Timestamp } from '@angular/fire/firestore';

/** Read-only inbox source — written by the student-facing site when a student taps
 *  "Chat with tutor". Doc id is `{studentUid}_{classId}_{chapterCode}`.
 *  `status` only ever holds `'notified'`; a request is considered handled once some
 *  non-cancelled `TutorSession.requestIds` contains its id (see TutorSessionsService). */
export interface TutorRequest {
  id: string;
  studentId: string;
  classId: string;
  chapterCode: string;
  status: 'notified';
  createdAt: Timestamp;
}
