import { inject, Injectable } from '@angular/core';
import { orderBy, where, limit, Timestamp } from '@angular/fire/firestore';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FirestoreService, FireResponse } from '../../core/services/fire/firestore.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { CacheService } from '../../core/services/cache/cache.service';
import { CACHE_TTL } from '../../core/constants/cache-ttl.constants';
import { Meeting } from '../../models/schedule/meeting.model';

const COLLECTION = 'global_meetings';

/** IST offset: UTC+5:30 = 330 minutes */
const IST_OFFSET_MS = 330 * 60 * 1000;

/** Build a Firestore Timestamp from a local IST date string + time string.
 *  e.g. istDateToTimestamp('2026-10-20', '10:30') */
export function istDateToTimestamp(dateStr: string, timeStr: string): Timestamp {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  // Construct UTC from IST by subtracting IST offset
  const utcMs = Date.UTC(y, mo - 1, d, h, min) - IST_OFFSET_MS;
  return Timestamp.fromMillis(utcMs);
}

/** Format a Firestore Timestamp as IST date string 'YYYY-MM-DD' */
export function toISTDateStr(ts: Timestamp): string {
  const d = new Date(ts.toMillis() + IST_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

/** Format a Firestore Timestamp as IST time string 'HH:MM' */
export function toISTTimeStr(ts: Timestamp): string {
  const d = new Date(ts.toMillis() + IST_OFFSET_MS);
  return d.toISOString().slice(11, 16);
}

export interface ScheduleCounts {
  week: number;
  month: number;
  total: number;
}

/** Start of the current IST week (Monday 00:00) and month (1st 00:00), plus the end of each. */
export function istPeriods(nowMs = Date.now()) {
  const ist = new Date(nowMs + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  const dayStart = Date.UTC(y, m, d) - IST_OFFSET_MS;
  const sinceMonday = (ist.getUTCDay() + 6) % 7;
  const weekStart = dayStart - sinceMonday * 24 * 60 * 60 * 1000;
  return {
    weekStart: Timestamp.fromMillis(weekStart),
    weekEnd: Timestamp.fromMillis(weekStart + 7 * 24 * 60 * 60 * 1000),
    monthStart: Timestamp.fromMillis(Date.UTC(y, m, 1) - IST_OFFSET_MS),
    monthEnd: Timestamp.fromMillis(Date.UTC(y, m + 1, 1) - IST_OFFSET_MS),
  };
}

export interface AttendanceResponse {
  code: string;
  totalUsers: number;
  users: string[];
}

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private fs = inject(FirestoreService);
  private auth = inject(AdminAuthService);
  private cache = inject(CacheService);
  private http = inject(HttpClient);

  private readonly workerBase = 'https://user-attendance.nikhiljose47.workers.dev';

  private windowStart(daysBack: number): Timestamp {
    return Timestamp.fromMillis(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  }

  /** Role-aware entrypoint — the only method screens should call.
   *  Admins see a recent+upcoming window across the whole platform;
   *  teachers only ever read documents where they are the assigned teacher,
   *  so no other teacher's schedule is ever fetched or rendered. */
  listForCurrentUser(daysBack = 7, pageLimit = 150): Promise<FireResponse<Meeting[]>> {
    return this.auth.isAdmin()
      ? this.listAllWindowed(daysBack, pageLimit)
      : this.listMine(daysBack, pageLimit);
  }

  /** Admin view: date-windowed instead of unbounded — avoids reading the
   *  entire historical collection on every dashboard visit. Cached briefly. */
  private listAllWindowed(daysBack: number, pageLimit: number): Promise<FireResponse<Meeting[]>> {
    return this.cache.get(`meetings:all:${daysBack}:${pageLimit}`, CACHE_TTL.SCHEDULE_WINDOW, () =>
      this.fs.getAllOnce<Meeting>(
        COLLECTION,
        where('date', '>=', this.windowStart(daysBack)),
        orderBy('date', 'desc'),
        limit(pageLimit),
      ),
    );
  }

  /** Teacher view: single equality filter (no composite index needed), then
   *  date-window filtering and sorting done in memory. */
  private listMine(daysBack: number, pageLimit: number): Promise<FireResponse<Meeting[]>> {
    const uid = this.auth.uid;
    if (!uid) return Promise.resolve({ ok: false, message: 'Not authenticated' });

    return this.cache.get(`meetings:mine:${uid}:${daysBack}`, CACHE_TTL.SCHEDULE_WINDOW, async () => {
      const res = await this.fs.getAllOnce<Meeting>(
        COLLECTION,
        where('teacherId', '==', uid),
        limit(500),
      );
      if (!res.ok) return res;
      const cutoff = this.windowStart(daysBack).toMillis();
      const data = (res.data ?? [])
        .filter(m => m.date.toMillis() >= cutoff)
        .sort((a, b) => b.date.toMillis() - a.date.toMillis())
        .slice(0, pageLimit);
      return { ok: true, data };
    });
  }

  /** Classes scheduled this week / this month / ever, by class date (IST calendar).
   *  Admins use server-side count queries; teachers fetch their own meetings in a
   *  single equality query (no composite index needed) and count in memory. */
  getCounts(): Promise<FireResponse<ScheduleCounts>> {
    const uid = this.auth.uid;
    const admin = this.auth.isAdmin();
    if (!admin && !uid) return Promise.resolve({ ok: false, message: 'Not authenticated' });

    const key = `meetings:counts:${admin ? 'all' : uid}`;
    return this.cache.get(key, CACHE_TTL.SCHEDULE_WINDOW, async () => {
      if (admin) {
        const p = istPeriods();
        const [week, month, total] = await Promise.all([
          this.fs.count(COLLECTION, where('date', '>=', p.weekStart), where('date', '<', p.weekEnd)),
          this.fs.count(COLLECTION, where('date', '>=', p.monthStart), where('date', '<', p.monthEnd)),
          this.fs.count(COLLECTION),
        ]);
        if (!week.ok || !month.ok || !total.ok) {
          return { ok: false, message: week.message ?? month.message ?? total.message } as FireResponse<ScheduleCounts>;
        }
        return { ok: true, data: { week: week.data!, month: month.data!, total: total.data! } };
      }

      // Teacher: single equality query, count in memory to avoid composite index.
      const res = await this.fs.getAllOnce<Meeting>(
        COLLECTION,
        where('teacherId', '==', uid!),
        limit(1000),
      );
      if (!res.ok) return { ok: false, message: res.message } as FireResponse<ScheduleCounts>;
      const meetings = res.data ?? [];
      const p = istPeriods();
      const weekMs  = [p.weekStart.toMillis(),  p.weekEnd.toMillis()];
      const monthMs = [p.monthStart.toMillis(), p.monthEnd.toMillis()];
      return {
        ok: true,
        data: {
          week:  meetings.filter(m => m.date.toMillis() >= weekMs[0]  && m.date.toMillis() < weekMs[1]).length,
          month: meetings.filter(m => m.date.toMillis() >= monthMs[0] && m.date.toMillis() < monthMs[1]).length,
          total: meetings.length,
        },
      };
    });
  }

  /** Load meetings for a specific batch. */
  listByBatch(batchId: string): Promise<FireResponse<Meeting[]>> {
    return this.cache.get(`meetings:batch:${batchId}`, CACHE_TTL.SCHEDULE_WINDOW, () =>
      this.fs.getAllOnce<Meeting>(
        COLLECTION,
        where('batchId', '==', batchId),
        orderBy('date', 'desc'),
        limit(50),
      ),
    );
  }

  /** Load meetings for a specific center (only works for admin-created ones with centerId). */
  listByCenter(centerId: string): Promise<FireResponse<Meeting[]>> {
    return this.cache.get(`meetings:center:${centerId}`, CACHE_TTL.SCHEDULE_WINDOW, () =>
      this.fs.getAllOnce<Meeting>(
        COLLECTION,
        where('centerId', '==', centerId),
        orderBy('date', 'desc'),
        limit(50),
      ),
    );
  }

  getMeeting(id: string): Promise<FireResponse<Meeting>> {
    return this.fs.getOnce<Meeting>(`${COLLECTION}/${id}`);
  }

  async createMeeting(data: {
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
    batchId: string;
    centerId: string;
    chapterCode: string;
    chapterName: string;
    meetLink: string;
    dateStr: string;   // YYYY-MM-DD in IST
    timeStr: string;   // HH:MM in IST
    durationMinutes: number;
    teacherId: string;
    teacherName: string;
    imageSrc: string;
    liveImages?: string[];
  }): Promise<FireResponse<string>> {
    const startTs = istDateToTimestamp(data.dateStr, data.timeStr);
    const endMs = startTs.toMillis() + data.durationMinutes * 60 * 1000;
    const endTs = Timestamp.fromMillis(endMs);

    const doc: Omit<Meeting, 'id'> = {
      classId: data.classId,
      className: data.className,
      subjectId: data.subjectId,
      subjectName: data.subjectName,
      batchId: data.batchId || 'default',
      centerId: data.centerId,
      meetLink: data.meetLink,
      chapterCode: data.chapterCode,
      chapterName: data.chapterName,
      status: 'PART1',
      date: startTs,
      endAt: endTs,
      duration: data.durationMinutes,
      createdAt: this.fs.serverTimestamp() as Timestamp,
      teacherId: data.teacherId,
      teacherName: data.teacherName,
      isFree: true,
      imageSrc: data.imageSrc,
      attendance: [],
    };
    if (data.liveImages?.length) doc.liveImages = data.liveImages.slice(0, 4);

    const res = await this.fs.add(COLLECTION, doc);
    if (res.ok) this.invalidateScheduleCache();
    return res;
  }

  async updateMeeting(id: string, data: {
    meetLink?: string;
    dateStr?: string;
    timeStr?: string;
    durationMinutes?: number;
    chapterCode?: string;
    chapterName?: string;
    liveImages?: string[];
  }): Promise<FireResponse<void>> {
    const patch: Record<string, unknown> = {};

    if (data.meetLink) patch['meetLink'] = data.meetLink;
    if (data.chapterCode) patch['chapterCode'] = data.chapterCode;
    if (data.chapterName) patch['chapterName'] = data.chapterName;

    if (data.dateStr && data.timeStr) {
      const startTs = istDateToTimestamp(data.dateStr, data.timeStr);
      const dur = data.durationMinutes ?? 30;
      patch['date'] = startTs;
      patch['endAt'] = Timestamp.fromMillis(startTs.toMillis() + dur * 60 * 1000);
    }

    if (data.liveImages) patch['liveImages'] = data.liveImages.slice(0, 4);

    if (data.durationMinutes) patch['duration'] = data.durationMinutes;

    const res = await this.fs.update(`${COLLECTION}/${id}`, patch);
    if (res.ok) this.invalidateScheduleCache();
    return res;
  }

  /** Cancel a session by setting endAt to now — matches existing app's pattern. */
  async cancelMeeting(id: string): Promise<FireResponse<void>> {
    const res = await this.fs.update(`${COLLECTION}/${id}`, {
      endAt: Timestamp.fromMillis(Date.now() - 1000),
    });
    if (res.ok) this.invalidateScheduleCache();
    return res;
  }

  /** Schedules change often (create/cancel/edit), so writes clear the cache
   *  immediately rather than waiting out the TTL. */
  private invalidateScheduleCache(): void {
    this.cache.invalidatePrefix('meetings:');
  }

  /** Fetch RSVP attendance from the Worker. classId is used as `code`. */
  async getAttendance(classId: string): Promise<AttendanceResponse | null> {
    try {
      return await firstValueFrom(
        this.http.get<AttendanceResponse>(`${this.workerBase}/users?code=${classId}&page=1&limit=200`),
      );
    } catch {
      return null;
    }
  }
}
