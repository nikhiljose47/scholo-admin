import { inject, Injectable } from '@angular/core';
import { doc, orderBy, limit, Timestamp } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { FirestoreService, FireResponse } from '../../core/services/fire/firestore.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { ScheduleService, istDateToTimestamp } from '../schedule/schedule.service';
import { SyllabusService } from '../schedule/syllabus.service';
import { TutorRequest } from '../../models/tutor/tutor-request.model';
import { TutorSession, TutorSessionStatus } from '../../models/tutor/tutor-session.model';

const REQUESTS_COLLECTION = 'tutor_requests';
const SESSIONS_COLLECTION = 'tutor_sessions';

export interface ScheduleSessionInput {
  studentIds: string[];
  teacherId: string;
  teacherName: string;
  meetLink: string;
  dateStr: string;   // YYYY-MM-DD, IST
  timeStr: string;   // HH:MM, IST
  durationMinutes: number;
  classId?: string;
  chapterCode?: string;
  title?: string;
  message?: string;
  requestIds?: string[];
  /** Also list this as a real bookable live-class slot on the chapter page. */
  alsoCreateLiveClass?: boolean;
}

export interface UpdateSessionInput {
  teacherId?: string;
  teacherName?: string;
  meetLink?: string;
  dateStr?: string;
  timeStr?: string;
  durationMinutes?: number;
  studentIds?: string[];
  status?: TutorSessionStatus;
  title?: string;
  message?: string;
}

/** Writes `tutor_sessions`, and now also `tutor_requests.status` — the single field the
 *  student app's "Chat with tutor" button reads to decide whether to re-enable. Admin/teacher
 *  is the only writer allowed to move a request to 'scheduled'/'resolved' or reopen it back to
 *  'notified'; the student app's own Firestore rules are what actually enforce that boundary. */
@Injectable({ providedIn: 'root' })
export class TutorRequestsService {
  private fs = inject(FirestoreService);
  private auth = inject(AdminAuthService);
  private schedule = inject(ScheduleService);
  private syllabus = inject(SyllabusService);

  /** Realtime: recent tutor_requests, newest first, every status — the inbox filters to
   *  'notified' client-side so staff can still see scheduled/resolved history to reopen. */
  listenRequests(): Observable<TutorRequest[]> {
    return this.fs
      .listenQuery<TutorRequest>(REQUESTS_COLLECTION, orderBy('createdAt', 'desc'), limit(200))
      .pipe(map(res => res.data ?? []));
  }

  /** Realtime: recent tutor_sessions, newest first. Drives the sessions board and stats header. */
  listenSessions(pageLimit = 300): Observable<TutorSession[]> {
    return this.fs
      .listenQuery<TutorSession>(SESSIONS_COLLECTION, orderBy('createdAt', 'desc'), limit(pageLimit))
      .pipe(map(res => res.data ?? []));
  }

  /** No extra read: the request doc backing this id is already held in the component's
   *  live `requests()` signal, so every caller already has it in hand before calling this. */
  markResolved(requestId: string): Promise<FireResponse<void>> {
    return this.fs.update(`${REQUESTS_COLLECTION}/${requestId}`, {
      status: 'resolved',
      resolvedAt: this.fs.serverTimestamp(),
      resolvedBy: this.auth.uid ?? '',
    });
  }

  reopenRequest(requestId: string): Promise<FireResponse<void>> {
    return this.fs.update(`${REQUESTS_COLLECTION}/${requestId}`, { status: 'notified' });
  }

  async scheduleSession(input: ScheduleSessionInput): Promise<FireResponse<string>> {
    const scheduledAt = istDateToTimestamp(input.dateStr, input.timeStr);

    const sessionDoc: Omit<TutorSession, 'id'> = {
      studentIds: input.studentIds,
      teacherId: input.teacherId,
      teacherName: input.teacherName,
      meetLink: input.meetLink,
      scheduledAt,
      durationMinutes: input.durationMinutes,
      status: 'scheduled',
      ...(input.classId && { classId: input.classId }),
      ...(input.chapterCode && { chapterCode: input.chapterCode }),
      ...(input.title && { title: input.title }),
      ...(input.message && { message: input.message }),
      ...(input.requestIds?.length && { requestIds: input.requestIds }),
      seenBy: [],
      createdAt: this.fs.serverTimestamp() as Timestamp,
      updatedAt: this.fs.serverTimestamp() as Timestamp,
    };

    let res: FireResponse<string>;
    try {
      // Atomic: the new session and the linked request(s)' status move together, in one
      // round trip — no read-before-write, since the request ids are already known.
      const batch = this.fs.batch();
      const sessionRef = doc(this.fs.colRef(SESSIONS_COLLECTION));
      batch.set(sessionRef, sessionDoc);
      for (const requestId of input.requestIds ?? []) {
        batch.update(this.fs.docRef(`${REQUESTS_COLLECTION}/${requestId}`), { status: 'scheduled' });
      }
      await batch.commit();
      res = { ok: true, data: sessionRef.id };
    } catch (e: unknown) {
      res = { ok: false, message: (e as Error).message };
    }

    if (res.ok && input.alsoCreateLiveClass && input.classId && input.chapterCode) {
      await this.tryCreateLiveClass(input);
    }

    return res;
  }

  /** Best-effort: resolves class/subject/chapter names from the same syllabus
   *  catalog the schedule form uses, then books a normal `global_meetings` slot
   *  so the session also shows up on the chapter page, not just as a bell ping.
   *  Failure here never fails session creation — the tutor_session write already
   *  succeeded and is what drives the student notification. */
  private async tryCreateLiveClass(input: ScheduleSessionInput): Promise<void> {
    try {
      const classSyllabus = await this.syllabus.loadAnyClass(input.classId!);
      if (!classSyllabus) return;
      const subject = classSyllabus.subjects.find(s => s.chapters.some(c => c.code === input.chapterCode));
      const chapter = subject?.chapters.find(c => c.code === input.chapterCode);

      await this.schedule.createMeeting({
        classId: input.classId!,
        className: classSyllabus.className,
        subjectId: subject?.code ?? 'tutor',
        subjectName: subject?.name ?? 'Tutor session',
        batchId: 'scholo-basic',
        centerId: 'scholo-basic',
        chapterCode: input.chapterCode!,
        chapterName: chapter?.name ?? input.chapterCode!,
        meetLink: input.meetLink,
        dateStr: input.dateStr,
        timeStr: input.timeStr,
        durationMinutes: input.durationMinutes,
        teacherId: input.teacherId,
        teacherName: input.teacherName,
        imageSrc: '',
      });
    } catch {
      // Non-fatal — see doc comment above.
    }
  }

  /** Any edit that changes when/where the session happens resets `seenBy` so the
   *  student is notified again, per the model's documented contract. */
  async updateSession(id: string, input: UpdateSessionInput): Promise<FireResponse<void>> {
    const patch: Record<string, unknown> = { updatedAt: this.fs.serverTimestamp() };
    let reschedule = false;

    if (input.teacherId !== undefined) patch['teacherId'] = input.teacherId;
    if (input.teacherName !== undefined) patch['teacherName'] = input.teacherName;
    if (input.studentIds !== undefined) patch['studentIds'] = input.studentIds;
    if (input.status !== undefined) patch['status'] = input.status;
    if (input.title !== undefined) patch['title'] = input.title;
    if (input.message !== undefined) patch['message'] = input.message;

    if (input.meetLink !== undefined) {
      patch['meetLink'] = input.meetLink;
      reschedule = true;
    }
    if (input.dateStr && input.timeStr) {
      patch['scheduledAt'] = istDateToTimestamp(input.dateStr, input.timeStr);
      reschedule = true;
    }
    if (input.durationMinutes !== undefined) patch['durationMinutes'] = input.durationMinutes;

    if (reschedule) patch['seenBy'] = [];

    return this.fs.update(`${SESSIONS_COLLECTION}/${id}`, patch);
  }

  /** Soft cancel — keeps history, does not re-notify. */
  cancelSession(id: string): Promise<FireResponse<void>> {
    return this.fs.update(`${SESSIONS_COLLECTION}/${id}`, {
      status: 'cancelled',
      updatedAt: this.fs.serverTimestamp(),
    });
  }

  /** Marks a request resolved without scheduling anything — a direct write to the same
   *  `tutor_requests` doc the student app reads, re-enabling "Chat with tutor" for them.
   *  No `tutor_sessions` stub is created; there's nothing to schedule, cancel or seen-by. */
  dismissRequest(request: TutorRequest): Promise<FireResponse<void>> {
    return this.markResolved(request.id);
  }

  /** Hard delete — confirmation-gated in the component, mistakes only. */
  deleteSession(id: string): Promise<FireResponse<void>> {
    return this.fs.delete(`${SESSIONS_COLLECTION}/${id}`);
  }
}
