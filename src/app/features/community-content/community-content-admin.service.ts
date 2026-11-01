import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Auth, getIdToken } from '@angular/fire/auth';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { PublicMedia } from '../../models/community-contracts/media';
import type { DraftFields } from '../../models/community-contracts/problem-draft';

export interface RowError { row: number; field: string; message: string }

export interface BatchReport {
  batchId: string;
  topicId: string;
  counts: { rows: number; new: number; update: number; unchanged: number; invalid: number; warnings: number };
  errors: RowError[];
  errorsTruncated: boolean;
  warnings: { row: number; message: string }[];
  publishable: number;
  publishedRelease: string | null;
  duplicateSource?: boolean;
}

export interface ReleaseManifest {
  release: string;
  previous: string | null;
  kind: 'publish' | 'edit' | 'unpublish';
  createdAt: string;
  itemCount: number;
  added: number;
  updated: number;
  removed: number;
}

export interface FieldError { field: string; message: string }

/** One private working copy, as the API returns it. */
export interface DraftDto {
  id: string;
  topicId: string;
  kind: 'new' | 'import' | 'published' | 'revision';
  state: 'draft' | 'live';
  revision: number;
  createdAt: string;
  updatedAt: string;
  createdByYou: boolean;
  updatedByYou: boolean;
  fields: DraftFields;
  basedOnContentVersion: number | null;
  baseStale: boolean;
  lastPublish: { release: string; contentVersion: number; at: string } | null;
  publicPath: string | null;
  readiness: { publishable: boolean; errors: FieldError[] };
}

export interface DraftListItem { id: string; title: string; type: string | null; kind: string; revision: number; updatedAt: string | null }

export interface DraftPreview {
  revision: number;
  saved: boolean;
  problem: Omit<DraftFields, 'media' | 'slug' | 'seoEligible'> & { id: string; topicId: string; media: PublicMedia[] };
  readiness: { publishable: boolean; errors: FieldError[] };
}

export interface StagedItems { items: { row: number; id: string; status: 'new' | 'update'; title: string }[]; offset: number; limit: number; publishable: number }

/** A failed admin call, reduced to what a person can act on (never a stack trace). */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Array<Partial<RowError> & FieldError> = [],
  ) {
    super(message);
  }
}

/**
 * Admin calls to the content API. The UI guard is only a convenience: the API verifies the Firebase
 * token against its admin allowlist on every request, and that check is the real one.
 */
@Injectable({ providedIn: 'root' })
export class CommunityContentAdminService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly apiBase = (environment.problemLibrary.apiBase ?? '').replace(/\/+$/, '');
  private readonly base = `${this.apiBase}/v1/admin/community`;

  readonly configured = !!environment.problemLibrary.enabled && this.apiBase !== '';

  async importBatch(topicId: string, format: 'json' | 'csv', body: string): Promise<BatchReport> {
    const auth = await this.authHeader();
    return this.run(this.http.post<BatchReport>(`${this.base}/imports?topicId=${encodeURIComponent(topicId)}&format=${format}`, body, { headers: { ...auth, 'Content-Type': 'text/plain' } }));
  }

  async publish(topicId: string, batchIds: string[]): Promise<{ release: string; alreadyPublished?: boolean; added?: number; updated?: number }> {
    const auth = await this.authHeader();
    return this.run(this.http.post<{ release: string; alreadyPublished?: boolean; added?: number; updated?: number }>(`${this.base}/topics/${encodeURIComponent(topicId)}/publish`, { batchIds }, { headers: auth }));
  }

  async releases(topicId: string): Promise<{ active: string | null; releases: ReleaseManifest[] }> {
    const auth = await this.authHeader();
    return this.run(this.http.get<{ active: string | null; releases: ReleaseManifest[] }>(`${this.base}/topics/${encodeURIComponent(topicId)}/releases?limit=20`, { headers: auth }));
  }

  async rollback(topicId: string, toRelease: string): Promise<{ release: string }> {
    const auth = await this.authHeader();
    return this.run(this.http.post<{ release: string }>(`${this.base}/topics/${encodeURIComponent(topicId)}/rollback`, { toRelease }, { headers: auth }));
  }

  async edit(topicId: string, problemId: string, expectedVersion: number, changes: Record<string, unknown>): Promise<{ release?: string; contentVersion?: number; unchanged?: boolean }> {
    const auth = await this.authHeader();
    return this.run(this.http.patch<{ release?: string; contentVersion?: number; unchanged?: boolean }>(`${this.base}/topics/${encodeURIComponent(topicId)}/problems/${encodeURIComponent(problemId)}`, { expectedVersion, changes }, { headers: auth }));
  }

  async unpublish(topicId: string, problemId: string, expectedVersion: number): Promise<{ release: string }> {
    const auth = await this.authHeader();
    return this.run(this.http.post<{ release: string }>(`${this.base}/topics/${encodeURIComponent(topicId)}/problems/${encodeURIComponent(problemId)}/unpublish`, { expectedVersion }, { headers: auth }));
  }

  async uploadMedia(file: File, alt: string, license: string, attribution: string): Promise<{ created: boolean; media: PublicMedia }> {
    const auth = await this.authHeader();
    const query = new URLSearchParams({ alt, sourceType: license === 'Scholo original' ? 'original' : 'licensed', license });
    if (attribution) query.set('attribution', attribution);
    return this.run(this.http.post<{ created: boolean; media: PublicMedia }>(`${this.base}/media?${query.toString()}`, file, { headers: { ...auth, 'Content-Type': 'application/octet-stream' } }));
  }

  // ----- single-problem drafts (doc 13) -----

  async createDraft(topicId: string, fields: Partial<DraftFields>, idempotencyKey: string): Promise<{ created: boolean; draft: DraftDto }> {
    const auth = await this.authHeader();
    return this.run(this.http.post<{ created: boolean; draft: DraftDto }>(`${this.base}/problems`, { topicId, fields }, { headers: { ...auth, 'Idempotency-Key': idempotencyKey } }));
  }

  async openForRevision(topicId: string, problemId: string): Promise<{ created: boolean; draft: DraftDto }> {
    const auth = await this.authHeader();
    return this.run(this.http.post<{ created: boolean; draft: DraftDto }>(`${this.base}/problems`, { topicId, from: { problemId } }, { headers: auth }));
  }

  async openImported(topicId: string, batchId: string, problemId: string): Promise<{ created: boolean; draft: DraftDto }> {
    const auth = await this.authHeader();
    return this.run(this.http.post<{ created: boolean; draft: DraftDto }>(`${this.base}/problems`, { topicId, from: { batchId, problemId } }, { headers: auth }));
  }

  async listDrafts(topicId: string, cursor?: string): Promise<{ items: DraftListItem[]; nextCursor: string | null }> {
    const auth = await this.authHeader();
    const query = new URLSearchParams({ topicId, visibility: 'draft' });
    if (cursor) query.set('cursor', cursor);
    return this.run(this.http.get<{ items: DraftListItem[]; nextCursor: string | null }>(`${this.base}/problems?${query.toString()}`, { headers: auth }));
  }

  async getDraft(topicId: string, id: string): Promise<DraftDto> {
    const auth = await this.authHeader();
    return (await this.run(this.http.get<{ draft: DraftDto }>(`${this.base}/problems/${encodeURIComponent(id)}?topicId=${encodeURIComponent(topicId)}`, { headers: auth }))).draft;
  }

  async saveDraft(topicId: string, id: string, expectedRevision: number, changes: Partial<DraftFields>): Promise<DraftDto> {
    const auth = await this.authHeader();
    return (await this.run(this.http.patch<{ draft: DraftDto }>(`${this.base}/problems/${encodeURIComponent(id)}?topicId=${encodeURIComponent(topicId)}`, { expectedRevision, changes }, { headers: auth }))).draft;
  }

  async previewDraft(topicId: string, id: string, fields?: Partial<DraftFields>): Promise<DraftPreview> {
    const auth = await this.authHeader();
    return this.run(this.http.post<DraftPreview>(`${this.base}/problems/${encodeURIComponent(id)}/preview?topicId=${encodeURIComponent(topicId)}`, fields ? { fields } : {}, { headers: auth }));
  }

  async publishDraft(topicId: string, id: string, expectedRevision: number): Promise<{ release: string; contentVersion: number; alreadyPublished?: boolean; unchanged?: boolean; publicPath?: string }> {
    const auth = await this.authHeader();
    return this.run(this.http.post<{ release: string; contentVersion: number; alreadyPublished?: boolean; unchanged?: boolean; publicPath?: string }>(
      `${this.base}/problems/${encodeURIComponent(id)}/publish?topicId=${encodeURIComponent(topicId)}`, { expectedRevision, confirm: true }, { headers: auth },
    ));
  }

  /** One page of the problems staged by an import batch (for opening them in the editor). */
  async stagedItems(batchId: string, offset: number): Promise<StagedItems> {
    const auth = await this.authHeader();
    return this.run(this.http.get<StagedItems>(`${this.base}/imports/${encodeURIComponent(batchId)}?offset=${offset}&limit=10`, { headers: auth }));
  }

  private async authHeader(): Promise<{ Authorization: string }> {
    if (!isPlatformBrowser(this.platformId)) throw new AdminApiError(0, 'NOT_BROWSER', 'Admin actions run in the browser.');
    await this.auth.authStateReady();
    const user = this.auth.currentUser;
    if (!user) throw new AdminApiError(401, 'AUTH_REQUIRED', 'Sign in as an administrator to continue.');
    return { Authorization: `Bearer ${await getIdToken(user, false)}` };
  }

  private async run<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw this.toAdminError(error);
    }
  }

  private toAdminError(error: unknown): AdminApiError {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as { error?: { code?: string; message?: string; errors?: Array<Partial<RowError> & FieldError> } } | null;
      const code = body?.error?.code ?? (error.status === 0 ? 'NETWORK' : `HTTP_${error.status}`);
      const message =
        error.status === 401 ? 'Your sign-in has expired. Sign in again.'
        : error.status === 403 ? 'This account is not allowed to manage community content.'
        : error.status === 0 ? 'Could not reach the content service. Check your connection and retry.'
        : (body?.error?.message ?? 'The request failed.');
      return new AdminApiError(error.status, code, message, body?.error?.errors ?? []);
    }
    return new AdminApiError(0, 'UNKNOWN', 'Something went wrong. Nothing was published.');
  }
}
