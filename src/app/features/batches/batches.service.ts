import { inject, Injectable } from '@angular/core';
import { where, orderBy, limit, serverTimestamp } from '@angular/fire/firestore';
import { FirestoreService, FireResponse } from '../../core/services/fire/firestore.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { CacheService } from '../../core/services/cache/cache.service';
import { CACHE_TTL } from '../../core/constants/cache-ttl.constants';
import {
  BatchDoc,
  PlanChapterDoc,
  PlanItemDoc,
  ProgressEventDoc,
  EnrollmentDoc,
  AuditEventDoc,
  SectionProgressStatus,
} from '../../models/batch/batch.model';

@Injectable({ providedIn: 'root' })
export class BatchesService {
  private fs = inject(FirestoreService);
  private auth = inject(AdminAuthService);
  private cache = inject(CacheService);

  private batchPath(centerId: string, batchId: string) {
    return `centers/${centerId}/batches/${batchId}`;
  }

  /** All non-archived batches in a center — admin view. Cached per center. */
  listBatches(centerId: string): Promise<FireResponse<BatchDoc[]>> {
    return this.cache.get(`batches:center:${centerId}`, CACHE_TTL.BATCH_LIST, () =>
      this.fs.getAllOnce<BatchDoc>(
        `centers/${centerId}/batches`,
        where('status', '!=', 'archived'),
        orderBy('status'),
        orderBy('name'),
      ),
    );
  }

  /** Only batches this teacher is actually assigned to — filtered server-side
   *  via array-contains so we never read batches that aren't theirs. */
  listMyBatches(centerId: string): Promise<FireResponse<BatchDoc[]>> {
    const uid = this.auth.uid;
    if (!uid) return Promise.resolve({ ok: false, message: 'Not authenticated' });

    return this.cache.get(`batches:center:${centerId}:teacher:${uid}`, CACHE_TTL.BATCH_LIST, () =>
      this.fs.getAllOnce<BatchDoc>(
        `centers/${centerId}/batches`,
        where('teacherUids', 'array-contains', uid),
      ),
    );
  }

  /** Role-aware entrypoint: admins see all batches, teachers see only their own. */
  listBatchesForCurrentUser(centerId: string): Promise<FireResponse<BatchDoc[]>> {
    return this.auth.isAdmin() ? this.listBatches(centerId) : this.listMyBatches(centerId);
  }

  getBatch(centerId: string, batchId: string): Promise<FireResponse<BatchDoc>> {
    return this.fs.getOnce<BatchDoc>(this.batchPath(centerId, batchId));
  }

  listenBatch(centerId: string, batchId: string) {
    return this.fs.listen<BatchDoc>(this.batchPath(centerId, batchId));
  }

  async createBatch(centerId: string, data: Omit<BatchDoc, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>): Promise<FireResponse<void>> {
    const uid = this.auth.uid!;
    const ts = this.fs.serverTimestamp();
    const res = await this.fs.createWithId(`centers/${centerId}/batches`, data.batchId, {
      ...data,
      recordType: 'center_batch',
      createdAt: ts,
      updatedAt: ts,
      createdBy: uid,
      updatedBy: uid,
    });
    if (res.ok) this.cache.invalidatePrefix(`batches:center:${centerId}`);
    return res;
  }

  async updateBatch(centerId: string, batchId: string, data: Partial<BatchDoc>): Promise<FireResponse<void>> {
    const res = await this.fs.update(this.batchPath(centerId, batchId), {
      ...data,
      updatedAt: this.fs.serverTimestamp(),
      updatedBy: this.auth.uid!,
    });
    if (res.ok) this.cache.invalidatePrefix(`batches:center:${centerId}`);
    return res;
  }

  // Plan chapters — cached per batch, invalidated on any plan/progress write.
  listPlanChapters(centerId: string, batchId: string): Promise<FireResponse<PlanChapterDoc[]>> {
    return this.cache.get(`planChapters:${centerId}:${batchId}`, CACHE_TTL.PLAN_ITEMS, () =>
      this.fs.getAllOnce<PlanChapterDoc>(
        `${this.batchPath(centerId, batchId)}/planChapters`,
        where('active', '==', true),
        orderBy('order'),
      ),
    );
  }

  // Plan items (sections) — cached per batch (or per chapter when scoped).
  listPlanItems(centerId: string, batchId: string, chapterInstanceId?: string): Promise<FireResponse<PlanItemDoc[]>> {
    const path = `${this.batchPath(centerId, batchId)}/planItems`;
    const key = chapterInstanceId
      ? `planItems:${centerId}:${batchId}:${chapterInstanceId}`
      : `planItems:${centerId}:${batchId}`;

    return this.cache.get(key, CACHE_TTL.PLAN_ITEMS, () =>
      chapterInstanceId
        ? this.fs.getAllOnce<PlanItemDoc>(path, where('chapterInstanceId', '==', chapterInstanceId), orderBy('order'))
        : this.fs.getAllOnce<PlanItemDoc>(path, where('active', '==', true), orderBy('order')),
    );
  }

  /** Updates section progress and appends an immutable progress event + audit event atomically */
  async updateSectionProgress(
    centerId: string,
    batchId: string,
    sectionInstanceId: string,
    fromStatus: SectionProgressStatus,
    toStatus: SectionProgressStatus,
    note?: string,
  ): Promise<FireResponse<void>> {
    const uid = this.auth.uid!;
    const ts = this.fs.serverTimestamp();
    const batch = this.fs.batch();

    // 1. Update plan item progress
    const itemRef = this.fs.docRef(`${this.batchPath(centerId, batchId)}/planItems/${sectionInstanceId}`);
    batch.update(itemRef, {
      'progress.status': toStatus,
      'progress.updatedAt': ts,
      'progress.updatedBy': uid,
      ...(toStatus === 'completed' ? { 'progress.actualDate': ts } : {}),
    });

    // 2. Append immutable progress event
    const eventRef = this.fs.docRef(
      `${this.batchPath(centerId, batchId)}/progressEvents/${Date.now()}_${uid}`,
    );
    batch.set(eventRef, {
      sectionInstanceId,
      batchId,
      centerId,
      actorUid: uid,
      fromStatus,
      toStatus,
      note: note ?? null,
      recordedAt: ts,
    });

    // 3. Append audit event
    const auditRef = this.fs.docRef(`centers/${centerId}/auditEvents/${Date.now()}_audit`);
    batch.set(auditRef, {
      centerId,
      batchId,
      actorUid: uid,
      action: 'progress_update',
      targetPath: `${this.batchPath(centerId, batchId)}/planItems/${sectionInstanceId}`,
      previousValue: { status: fromStatus },
      newValue: { status: toStatus },
      recordedAt: ts,
    });

    try {
      await batch.commit();
      this.cache.invalidatePrefix(`planItems:${centerId}:${batchId}`);
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, message: (e as Error).message };
    }
  }

  // Enrollments
  listEnrollments(centerId: string, batchId: string): Promise<FireResponse<EnrollmentDoc[]>> {
    return this.fs.getAllOnce<EnrollmentDoc>(
      `${this.batchPath(centerId, batchId)}/enrollments`,
      where('active', '==', true),
    );
  }

  async enrollStudent(centerId: string, batchId: string, studentUid: string): Promise<FireResponse<void>> {
    return this.fs.createWithId(
      `${this.batchPath(centerId, batchId)}/enrollments`,
      studentUid,
      {
        studentUid,
        batchId,
        centerId,
        enrolledAt: this.fs.serverTimestamp(),
        enrolledBy: this.auth.uid!,
        active: true,
      },
    );
  }

  // Audit
  listAuditEvents(centerId: string, batchId?: string, pageLimit = 50): Promise<FireResponse<AuditEventDoc[]>> {
    const constraints = batchId
      ? [where('batchId', '==', batchId), orderBy('recordedAt', 'desc'), limit(pageLimit)]
      : [orderBy('recordedAt', 'desc'), limit(pageLimit)];
    return this.fs.getAllOnce<AuditEventDoc>(`centers/${centerId}/auditEvents`, ...constraints);
  }
}
