import { inject, Injectable } from '@angular/core';
import { deleteField } from '@angular/fire/firestore';
import { CacheService } from '../../core/services/cache/cache.service';
import { CACHE_TTL } from '../../core/constants/cache-ttl.constants';
import { FirestoreService, FireResponse } from '../../core/services/fire/firestore.service';
import { ClassDoc, MaterialDoc, ProviderDoc } from '../../models/content/content.model';

/** Reads/writes the learner app's providers, classes and class materials collections. */
@Injectable({ providedIn: 'root' })
export class ProvidersService {
  private fs = inject(FirestoreService);
  private cache = inject(CacheService);

  listProviders(): Promise<FireResponse<ProviderDoc[]>> {
    return this.cache.get('providers:list', CACHE_TTL.CENTERS_LIST, () => this.fs.getAllOnce<ProviderDoc>('providers'));
  }

  /** Saves only the admin-set fields. A key mapped to `null` is removed from the document. */
  async saveProvider(id: string, fields: Partial<Record<keyof ProviderDoc, unknown>>): Promise<FireResponse<void>> {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) data[k] = v === null ? deleteField() : v;
    const res = await this.fs.setMerge(`providers/${id}`, data);
    this.cache.invalidate('providers:list');
    return res;
  }

  listClasses(): Promise<FireResponse<ClassDoc[]>> {
    return this.cache.get('classes:list', CACHE_TTL.CENTERS_LIST, () => this.fs.getAllOnce<ClassDoc>('classes'));
  }

  async setClassProvider(classId: string, providerId: string | null): Promise<FireResponse<void>> {
    const res = await this.fs.setMerge(`classes/${classId}`, { providerId: providerId ?? deleteField() });
    this.cache.invalidate('classes:list');
    return res;
  }

  listMaterials(classId: string): Promise<FireResponse<MaterialDoc[]>> {
    return this.fs.getAllOnce<MaterialDoc>(`classes/${classId}/materials`);
  }

  async saveMaterial(classId: string, m: Omit<MaterialDoc, 'createdAt' | 'updatedAt'>): Promise<FireResponse<void>> {
    const path = `classes/${classId}/materials`;
    const ts = this.fs.serverTimestamp();
    const existing = await this.fs.getOnce<MaterialDoc>(`${path}/${m.id}`);
    return this.fs.setMerge(`${path}/${m.id}`, {
      id: m.id,
      title: m.title,
      chapterId: m.chapterId,
      fileUrl: m.fileUrl,
      updatedAt: ts,
      ...(existing.ok ? {} : { createdAt: ts }),
    });
  }

  deleteMaterial(classId: string, id: string): Promise<FireResponse<void>> {
    return this.fs.delete(`classes/${classId}/materials/${id}`);
  }

  newMaterialId(): string {
    return crypto.randomUUID();
  }
}
