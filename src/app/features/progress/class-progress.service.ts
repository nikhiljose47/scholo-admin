import { inject, Injectable } from '@angular/core';
import { FirestoreService, FireResponse } from '../../core/services/fire/firestore.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';

export interface ClassBatchProgress {
  curChapterId?: string;
}

/** Per-class teaching progress, stored on classes/{classId}/batches/{batchId}.curChapterId —
 *  the same field the learner app reads as "current chapter". Chapters before it are
 *  done, it is in progress, those after are upcoming. */
@Injectable({ providedIn: 'root' })
export class ClassProgressService {
  private fs = inject(FirestoreService);
  private auth = inject(AdminAuthService);

  private path(classId: string, batchId: string) {
    return `classes/${classId}/batches/${batchId}`;
  }

  async getCurrentChapter(classId: string, batchId: string): Promise<string | null> {
    const res = await this.fs.getOnce<ClassBatchProgress>(this.path(classId, batchId));
    return res.data?.curChapterId ?? null;
  }

  setCurrentChapter(classId: string, batchId: string, chapterId: string): Promise<FireResponse<void>> {
    return this.fs.setMerge(this.path(classId, batchId), {
      curChapterId: chapterId,
      progressUpdatedAt: this.fs.serverTimestamp(),
      progressUpdatedBy: this.auth.uid,
    });
  }
}
