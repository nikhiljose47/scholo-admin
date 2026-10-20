import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CacheService } from '../../core/services/cache/cache.service';
import { environment } from '../../../environments/environment';
import { SyllabusIndex, SyllabusIndexEntry, ClassSyllabus } from '../../models/syllabus/syllabus.model';

const INDEX_TTL = 60 * 60 * 1000; // 1 hour
const CLASS_TTL = 60 * 60 * 1000;

/** Reads the same canonical syllabus catalog the live app uses
 *  (content.scholo.co.in, R2-hosted JSON) — never duplicated into Firestore. */
@Injectable({ providedIn: 'root' })
export class SyllabusService {
  private http = inject(HttpClient);
  private cache = inject(CacheService);

  listClasses(): Promise<SyllabusIndexEntry[]> {
    return this.cache.get('syllabus:index', INDEX_TTL, async () => {
      const index = await firstValueFrom(
        this.http.get<SyllabusIndex>(`${environment.syllabusApiBaseUrl}/index/syllabus-index.json`),
      );
      return index.classes ?? [];
    });
  }

  async loadClass(classId: string): Promise<ClassSyllabus | null> {
    return this.cache.get(`syllabus:class:${classId}`, CLASS_TTL, async () => {
      const entries = await this.listClasses();
      const entry = entries.find(e => e.classId === classId);
      if (!entry) return null;
      return firstValueFrom(
        this.http.get<ClassSyllabus>(`${environment.syllabusApiBaseUrl}/syllabus/${entry.file}`),
      );
    });
  }
}
