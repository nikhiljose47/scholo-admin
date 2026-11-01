import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  ProblemDifficulty,
  ProblemListResponse,
  PublicProblemDetail,
} from '../../models/community-contracts/problem-library';
import type { PublicMedia } from '../../models/community-contracts/media';

export type { ProblemListResponse, PublicProblemDetail, PublicMedia };
export type { ProblemSummary } from '../../models/community-contracts/problem-library';

export interface ProblemListParams {
  limit?: number;
  cursor?: string | null;
  difficulty?: ProblemDifficulty | null;
  concept?: string | null;
  tag?: string | null;
  q?: string | null;
}

export type LibraryErrorKind = 'not-found' | 'stale' | 'invalid' | 'network';

/** Maps an HTTP failure to what the screen should say. 404 also covers drafts/unpublished (indistinguishable by design). */
export function classifyLibraryError(error: unknown): LibraryErrorKind {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  const code = error instanceof HttpErrorResponse ? (error.error as { error?: { code?: string } } | null)?.error?.code : undefined;
  if (status === 404) return 'not-found';
  if (status === 409 && code === 'CATALOG_VERSION_CHANGED') return 'stale';
  if (status === 400) return 'invalid';
  return 'network';
}

/** Public, unauthenticated reads of the Problem Library. Safe to call during SSR. */
@Injectable({ providedIn: 'root' })
export class ProblemLibraryService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = (environment.problemLibrary.apiBase ?? '').replace(/\/+$/, '');

  readonly enabled = !!environment.problemLibrary.enabled && this.apiBase !== '';

  list(topicId: string, params: ProblemListParams): Observable<ProblemListResponse> {
    let query = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== '') query = query.set(key, String(value));
    }
    return this.http.get<ProblemListResponse>(`${this.apiBase}/v1/public/community/topics/${encodeURIComponent(topicId)}/problems`, { params: query });
  }

  detail(topicId: string, problemId: string): Observable<PublicProblemDetail> {
    return this.http.get<PublicProblemDetail>(
      `${this.apiBase}/v1/public/community/topics/${encodeURIComponent(topicId)}/problems/${encodeURIComponent(problemId)}`,
    );
  }

  mediaUrl(media: PublicMedia): string {
    return `${this.apiBase}${media.url}`;
  }
}
