import { inject, Injectable } from '@angular/core';
import { FirestoreService, FireResponse } from '../../core/services/fire/firestore.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';

export interface ClassBatchProgress {
  curChapterId?: string;
}

/** Teaching progress per (tuition center, syllabus class), stored on
 *  classes/{classId}/batches/{centerId}.curChapterId — the batch doc id is the center's
 *  provider id, so every center tracks its own current chapter. Chapters before it are
 *  done, it is in progress, those after are upcoming. Never cached: a teacher must always
 *  see what they last saved. */
@Injectable({ providedIn: 'root' })
export class ClassProgressService {
  private fs = inject(FirestoreService);
  private auth = inject(AdminAuthService);

  private path(classId: string, centerId: string) {
    return `classes/${classId}/batches/${centerId}`;
  }

  async getCurrentChapter(classId: string, centerId: string): Promise<string | null> {
    const res = await this.fs.getOnce<ClassBatchProgress>(this.path(classId, centerId));
    return res.data?.curChapterId ?? null;
  }

  setCurrentChapter(classId: string, centerId: string, chapterId: string): Promise<FireResponse<void>> {
    return this.fs.setMerge(this.path(classId, centerId), {
      curChapterId: chapterId,
      providerId: centerId,
      progressUpdatedAt: this.fs.serverTimestamp(),
      progressUpdatedBy: this.auth.uid,
    });
  }
}
