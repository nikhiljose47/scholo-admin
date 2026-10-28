import { inject, Injectable } from '@angular/core';
import { where, Timestamp } from '@angular/fire/firestore';
import { FirestoreService, FireResponse } from '../../core/services/fire/firestore.service';
import { CacheService } from '../../core/services/cache/cache.service';
import { CACHE_TTL } from '../../core/constants/cache-ttl.constants';
import { StudentSessionResult, RosterEntry } from '../../models/schedule/session-result.model';
import { UserModel } from '../../models/user/user.model';
import { EnrollmentDoc } from '../../models/batch/batch.model';

const RESULTS_COL = 'student_assessment';

@Injectable({ providedIn: 'root' })
export class SessionWrapUpService {
  private fs = inject(FirestoreService);
  private cache = inject(CacheService);

  /** Load enrolled students with their display names for attendance and import resolution. */
  async loadRoster(centerId: string, batchId: string): Promise<RosterEntry[]> {
    const key = `roster:${centerId}:${batchId}`;
    return this.cache.get(key, CACHE_TTL.STUDENTS_LIST, async () => {
      const [enrollRes, userRes] = await Promise.all([
        this.fs.getAllOnce<EnrollmentDoc>(
          `centers/${centerId}/batches/${batchId}/enrollments`,
          where('active', '==', true),
        ),
        this.fs.getAllOnce<UserModel>('users', where('role', '==', 'student')),
      ]);

      if (!enrollRes.ok || !enrollRes.data?.length) return [] as RosterEntry[];

      const uidSet = new Set(enrollRes.data.map(e => e.studentUid));
      const usersById = new Map((userRes.data ?? []).map(u => [u.uid, u]));

      return enrollRes.data
        .filter(e => uidSet.has(e.studentUid))
        .map(e => {
          const user = usersById.get(e.studentUid);
          return { uid: e.studentUid, name: user?.name ?? e.studentUid, email: user?.email ?? '' };
        });
    });
  }

  /** Load saved assessment results for a session. */
  async loadResults(sessionId: string): Promise<FireResponse<StudentSessionResult[]>> {
    return this.fs.getAllOnce<StudentSessionResult>(
      RESULTS_COL,
      where('sessionId', '==', sessionId),
    );
  }

  /**
   * Persist results using merge/set semantics: same sessionId+studentId always writes
   * to the same document, so re-importing is idempotent.
   * Uses parallel setMerge calls (no batch limit per item).
   */
  async saveResults(results: StudentSessionResult[]): Promise<FireResponse<void>> {
    if (!results.length) return { ok: true };
    const now = this.fs.serverTimestamp();
    try {
      await Promise.all(results.map(r => {
        const docId = `${r.sessionId}_${r.studentId ?? r.studentUid}`;
        return this.fs.setMerge(`${RESULTS_COL}/${docId}`, { ...r, updatedAt: now });
      }));
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, message: (e as Error).message };
    }
  }

  /**
   * Submit class in a single Firestore batch:
   *   1. Upsert all student assessment results (merge semantics).
   *   2. Write attendance, feedback, endAt = now, status = 'completed' onto the meeting doc.
   */
  async submitClass(opts: {
    meetingId: string;
    results: StudentSessionResult[];
    attendance: string[];
    feedback: string;
  }): Promise<FireResponse<void>> {
    const batch = this.fs.batch();
    const now = this.fs.serverTimestamp();

    for (const r of opts.results) {
      const docId = `${r.sessionId}_${r.studentId ?? r.studentUid}`;
      const ref = this.fs.docRef(`${RESULTS_COL}/${docId}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (batch as any).set(ref, { ...r, updatedAt: now }, { merge: true });
    }

    const meetRef = this.fs.docRef(`global_meetings/${opts.meetingId}`);
    batch.update(meetRef, {
      attendance: opts.attendance,
      feedback: opts.feedback,
      endAt: Timestamp.fromMillis(Date.now()),
      status: 'completed',
    });

    try {
      await batch.commit();
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, message: (e as Error).message };
    }
  }
}
