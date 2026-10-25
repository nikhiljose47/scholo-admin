import { inject, Injectable } from '@angular/core';
import { FirestoreService, FireResponse } from '../../core/services/fire/firestore.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { CacheService } from '../../core/services/cache/cache.service';
import { CACHE_TTL } from '../../core/constants/cache-ttl.constants';

export interface ClassBatchProgress {
  curChapterId?: string;
}

/** Teaching progress per (tuition center, syllabus class), stored on
 *  classes/{classId}/batches/{centerId}.curChapterId. Cached briefly so the
 *  progress page and schedule form don't re-read every card on every visit;
 *  writes invalidate the cache entry immediately. */
@Injectable({ providedIn: 'root' })
export class ClassProgressService {
  private fs = inject(FirestoreService);
  private auth = inject(AdminAuthService);
  private cache = inject(CacheService);

  private path(classId: string, centerId: string) {
    return `classes/${classId}/batches/${centerId}`;
  }

  private cacheKey(classId: string, centerId: string) {
    return `progress:chapter:${classId}:${centerId}`;
  }

  async getCurrentChapter(classId: string, centerId: string): Promise<string | null> {
    return this.cache.get(this.cacheKey(classId, centerId), CACHE_TTL.PROGRESS_CHAPTER, async () => {
      const res = await this.fs.getOnce<ClassBatchProgress>(this.path(classId, centerId));
      return res.data?.curChapterId ?? null;
    });
  }

  async setCurrentChapter(classId: string, centerId: string, chapterId: string): Promise<FireResponse<void>> {
    const res = await this.fs.setMerge(this.path(classId, centerId), {
      curChapterId: chapterId,
      providerId: centerId,
      progressUpdatedAt: this.fs.serverTimestamp(),
      progressUpdatedBy: this.auth.uid,
    });
    if (res.ok) this.cache.invalidate(this.cacheKey(classId, centerId));
    return res;
  }
}
