import { Timestamp } from '@angular/fire/firestore';

/** Matches the existing global_meetings document shape exactly.
 *  centerId is added by the admin and absent on legacy documents. */
export interface Meeting {
  id: string;
  classId: string;
  className?: string;
  subjectId: string;
  subjectName?: string;
  batchId: string;       // 'default' on legacy docs
  centerId?: string;     // added by admin; absent on existing docs
  meetLink: string;
  chapterCode: string;
  chapterName?: string;
  /** Always 'PART1' in existing docs; admin should keep same value for compat. */
  status: string;
  date: Timestamp;
  endAt: Timestamp;
  duration: number;      // minutes
  createdAt: Timestamp;
  teacherId: string;
  teacherName: string;
  isFree?: boolean;
  imageSrc: string;
  /** 1-4 temporary thumbnail URLs (Storage live-class/{id}/n.webp); absent on legacy docs. */
  liveImages?: string[];
  attendance: string[];  // studentUids; managed by Worker RSVP
}

export type SessionState = 'live' | 'upcoming' | 'past';

export function sessionState(m: Meeting): SessionState {
  const now = Date.now();
  const start = m.date.toMillis();
  const end = m.endAt.toMillis();
  if (now >= start && now <= end) return 'live';
  if (now < start) return 'upcoming';
  return 'past';
}
