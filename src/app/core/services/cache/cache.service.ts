import { Injectable } from '@angular/core';

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

/** In-memory TTL cache with in-flight dedup — avoids duplicate Firestore reads
 *  when multiple components request the same data within its TTL window. */
@Injectable({ providedIn: 'root' })
export class CacheService {
  private store = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<unknown>>();

  async get<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cached = this.store.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }

    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = loader()
      .then(data => {
        this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
        this.inflight.delete(key);
        return data;
      })
      .catch(err => {
        this.inflight.delete(key);
        throw err;
      });

    this.inflight.set(key, promise);
    return promise;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }
}
