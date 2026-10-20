import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CacheService } from '../../core/services/cache/cache.service';
import { environment } from '../../../environments/environment';
import { SyllabusIndex, SyllabusIndexEntry, ClassSyllabus, PuzzlesIndex, ClassPuzzles } from '../../models/syllabus/syllabus.model';

const INDEX_TTL = 60 * 60 * 1000; // 1 hour
const CLASS_TTL = 60 * 60 * 1000;

/** Gives the admin app its own CDN cache entries on content.scholo.co.in, so a copy cached
 *  without CORS headers (e.g. from a plain browser visit) can never be served to it. */
const CACHE_VARIANT = '?client=admin';

/** Reads the same canonical syllabus catalog the live app uses
 *  (content.scholo.co.in, R2-hosted JSON) — never duplicated into Firestore. */
@Injectable({ providedIn: 'root' })
export class SyllabusService {
  private http = inject(HttpClient);
  private cache = inject(CacheService);

  listClasses(): Promise<SyllabusIndexEntry[]> {
    return this.cache.get('syllabus:index', INDEX_TTL, async () => {
      const index = await firstValueFrom(
        this.http.get<SyllabusIndex>(`${environment.syllabusApiBaseUrl}/index/syllabus-index.json${CACHE_VARIANT}`),
      );
      // Live index lists everything under `catalog`; only enabled classes are offered.
      if (index.catalog) {
        return index.catalog
          .filter(e => e.type === 'class' && e.enabled && e.file)
          .map(e => ({ classId: e.id, className: e.title, file: e.file! }));
      }
      return index.classes ?? [];
    });
  }

  /** Class ids that have a puzzles file, mapped to that file's path. */
  private puzzleFiles(): Promise<Map<string, string>> {
    return this.cache.get('puzzles:index', INDEX_TTL, async () => {
      const index = await firstValueFrom(
        this.http.get<PuzzlesIndex>(`${environment.syllabusApiBaseUrl}/index/puzzles-index.json${CACHE_VARIANT}`),
      );
      return new Map((index.files ?? []).map(f => [f.classId, f.file] as [string, string]));
    });
  }

  async listPuzzleClassIds(): Promise<string[]> {
    return [...(await this.puzzleFiles()).keys()];
  }

  async loadPuzzles(classId: string): Promise<ClassPuzzles | null> {
    return this.cache.get(`puzzles:class:${classId}`, CLASS_TTL, async () => {
      const file = (await this.puzzleFiles()).get(classId);
      if (!file) return null;
      return firstValueFrom(
        this.http.get<ClassPuzzles>(`${environment.syllabusApiBaseUrl}/${file}${CACHE_VARIANT}`),
      );
    });
  }

  async loadClass(classId: string): Promise<ClassSyllabus | null> {
    return this.cache.get(`syllabus:class:${classId}`, CLASS_TTL, async () => {
      const entries = await this.listClasses();
      const entry = entries.find(e => e.classId === classId);
      if (!entry) return null;
      return firstValueFrom(
        this.http.get<ClassSyllabus>(`${environment.syllabusApiBaseUrl}/syllabus/${entry.file}${CACHE_VARIANT}`),
      );
    });
  }
}
