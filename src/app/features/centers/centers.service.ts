import { inject, Injectable } from '@angular/core';
import { where, orderBy, limit } from '@angular/fire/firestore';
import { FirestoreService, FireResponse } from '../../core/services/fire/firestore.service';
import { AdminAuthService } from '../../core/services/auth/admin-auth.service';
import { CacheService } from '../../core/services/cache/cache.service';
import { CACHE_TTL } from '../../core/constants/cache-ttl.constants';
import {
  CenterDoc,
  CenterMember,
  CenterApplication,
  CenterOperations,
} from '../../models/center/center.model';

const CENTERS = 'centers';
const APPLICATIONS = 'centerApplications';

@Injectable({ providedIn: 'root' })
export class CentersService {
  private fs = inject(FirestoreService);
  private auth = inject(AdminAuthService);
  private cache = inject(CacheService);

  /** All published centers — admin-only view. Cached: centers change rarely. */
  listCenters(pageLimit = 50): Promise<FireResponse<CenterDoc[]>> {
    return this.cache.get(`centers:all:${pageLimit}`, CACHE_TTL.CENTERS_LIST, () =>
      this.fs.getAllOnce<CenterDoc>(CENTERS, orderBy('name'), limit(pageLimit)),
    );
  }

  /** Only the centers the signed-in user is an active member of.
   *  One collection-group read (cheap, indexed by uid) plus one read per
   *  matched center — never scans the full `centers` collection. */
  listMyCenters(): Promise<FireResponse<CenterDoc[]>> {
    const uid = this.auth.uid;
    if (!uid) return Promise.resolve({ ok: false, message: 'Not authenticated' });

    return this.cache.get(`centers:member:${uid}`, CACHE_TTL.CENTERS_LIST, async () => {
      const memberRes = await this.fs.getCollectionGroupOnce<CenterMember>(
        'members',
        where('uid', '==', uid),
        where('active', '==', true),
      );
      const centerIds = Array.from(
        new Set((memberRes.data ?? []).map(m => m._parentId).filter((id): id is string => !!id)),
      );
      if (centerIds.length === 0) return { ok: true, data: [] } as FireResponse<CenterDoc[]>;

      const centers = await Promise.all(centerIds.map(id => this.getCenter(id)));
      return {
        ok: true,
        data: centers.filter(c => c.ok && c.data).map(c => c.data!),
      } as FireResponse<CenterDoc[]>;
    });
  }

  /** Role-aware entrypoint: admins see every center, teachers see only their own. */
  listCentersForCurrentUser(): Promise<FireResponse<CenterDoc[]>> {
    return this.auth.isAdmin() ? this.listCenters() : this.listMyCenters();
  }

  getCenter(centerId: string): Promise<FireResponse<CenterDoc>> {
    return this.fs.getOnce<CenterDoc>(`${CENTERS}/${centerId}`);
  }

  listenCenters() {
    return this.fs.listenQuery<CenterDoc>(CENTERS, orderBy('name'), limit(50));
  }

  async createCenter(data: Omit<CenterDoc, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>): Promise<FireResponse<void>> {
    const uid = this.auth.uid!;
    const ts = this.fs.serverTimestamp();
    const res = await this.fs.createWithId(CENTERS, data.centerId, {
      ...data,
      createdAt: ts,
      updatedAt: ts,
      createdBy: uid,
      updatedBy: uid,
    });
    if (res.ok) this.cache.invalidatePrefix('centers:all');
    return res;
  }

  async updateCenter(centerId: string, data: Partial<CenterDoc>): Promise<FireResponse<void>> {
    const res = await this.fs.update(`${CENTERS}/${centerId}`, {
      ...data,
      updatedAt: this.fs.serverTimestamp(),
      updatedBy: this.auth.uid!,
    });
    if (res.ok) this.cache.invalidatePrefix('centers:');
    return res;
  }

  getMembers(centerId: string): Promise<FireResponse<CenterMember[]>> {
    return this.fs.getAllOnce<CenterMember>(`${CENTERS}/${centerId}/members`);
  }

  async addMember(centerId: string, uid: string, role: CenterMember['role']): Promise<FireResponse<void>> {
    const res = await this.fs.createWithId(`${CENTERS}/${centerId}/members`, uid, {
      uid,
      role,
      addedAt: this.fs.serverTimestamp(),
      addedBy: this.auth.uid!,
      active: true,
    });
    if (res.ok) this.cache.invalidate(`centers:member:${uid}`);
    return res;
  }

  async removeMember(centerId: string, uid: string): Promise<FireResponse<void>> {
    const res = await this.fs.update(`${CENTERS}/${centerId}/members/${uid}`, { active: false });
    if (res.ok) this.cache.invalidate(`centers:member:${uid}`);
    return res;
  }

  listApplications(status?: CenterApplication['status']): Promise<FireResponse<CenterApplication[]>> {
    if (status) {
      return this.fs.getAllOnce<CenterApplication>(APPLICATIONS, where('status', '==', status), orderBy('submittedAt', 'desc'));
    }
    return this.fs.getAllOnce<CenterApplication>(APPLICATIONS, orderBy('submittedAt', 'desc'));
  }

  async approveApplication(applicationId: string, centerId: string): Promise<FireResponse<void>> {
    return this.fs.update(`${APPLICATIONS}/${applicationId}`, {
      status: 'approved',
      reviewedBy: this.auth.uid!,
      reviewedAt: this.fs.serverTimestamp(),
    });
  }

  getOperations(centerId: string): Promise<FireResponse<CenterOperations>> {
    return this.fs.getOnce<CenterOperations>(`${CENTERS}/${centerId}/private/operations`);
  }

  updateOperations(centerId: string, data: Partial<CenterOperations>): Promise<FireResponse<void>> {
    return this.fs.update(`${CENTERS}/${centerId}/private/operations`, {
      ...data,
      updatedAt: this.fs.serverTimestamp(),
      updatedBy: this.auth.uid!,
    });
  }
}
