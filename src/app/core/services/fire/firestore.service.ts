import { inject, Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  DocumentReference,
  QueryConstraint,
  serverTimestamp,
  runTransaction,
  writeBatch,
  CollectionReference,
  DocumentData,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface FireResponse<T> {
  ok: boolean;
  data?: T;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class FirestoreService {
  private fs = inject(Firestore);

  serverTimestamp() {
    return serverTimestamp();
  }

  docRef(path: string): DocumentReference {
    return doc(this.fs, path);
  }

  colRef(path: string): CollectionReference<DocumentData> {
    return collection(this.fs, path);
  }

  async getOnce<T>(path: string): Promise<FireResponse<T>> {
    try {
      const snap = await getDoc(doc(this.fs, path));
      if (!snap.exists()) return { ok: false, message: 'Not found' };
      return { ok: true, data: { id: snap.id, ...snap.data() } as T };
    } catch (e: unknown) {
      return { ok: false, message: (e as Error).message };
    }
  }

  async getAllOnce<T>(path: string, ...constraints: QueryConstraint[]): Promise<FireResponse<T[]>> {
    try {
      const col = collection(this.fs, path);
      const q = constraints.length ? query(col, ...constraints) : query(col, limit(50));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }) as T);
      return { ok: true, data };
    } catch (e: unknown) {
      return { ok: false, message: (e as Error).message };
    }
  }

  /** Collection-group read across all subcollections with this name (e.g. all centers/*\/members).
   *  Each returned item carries `_parentId`, the immediate parent document's id, so callers
   *  can resolve ownership (e.g. centerId) without a second read per document. */
  async getCollectionGroupOnce<T>(collectionId: string, ...constraints: QueryConstraint[]): Promise<FireResponse<(T & { _parentId?: string })[]>> {
    try {
      const colGroup = collectionGroup(this.fs, collectionId);
      const q = constraints.length ? query(colGroup, ...constraints) : query(colGroup, limit(50));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({
        id: d.id,
        _parentId: d.ref.parent.parent?.id,
        ...d.data(),
      }) as unknown as T & { _parentId?: string });
      return { ok: true, data };
    } catch (e: unknown) {
      return { ok: false, message: (e as Error).message };
    }
  }

  async createWithId<T extends object>(path: string, id: string, data: T): Promise<FireResponse<void>> {
    try {
      await setDoc(doc(this.fs, path, id), { ...data, id });
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, message: (e as Error).message };
    }
  }

  async add<T extends object>(path: string, data: T): Promise<FireResponse<string>> {
    try {
      const ref = await addDoc(collection(this.fs, path), data);
      return { ok: true, data: ref.id };
    } catch (e: unknown) {
      return { ok: false, message: (e as Error).message };
    }
  }

  async update<T extends object>(path: string, data: Partial<T>): Promise<FireResponse<void>> {
    try {
      await updateDoc(doc(this.fs, path), data as DocumentData);
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, message: (e as Error).message };
    }
  }

  async delete(path: string): Promise<FireResponse<void>> {
    try {
      await deleteDoc(doc(this.fs, path));
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, message: (e as Error).message };
    }
  }

  listen<T>(path: string): Observable<FireResponse<T>> {
    return new Observable(observer => {
      const unsub = onSnapshot(
        doc(this.fs, path),
        snap => {
          if (!snap.exists()) {
            observer.next({ ok: false, message: 'Not found' });
          } else {
            observer.next({ ok: true, data: { id: snap.id, ...snap.data() } as T });
          }
        },
        err => observer.next({ ok: false, message: err.message }),
      );
      return unsub;
    });
  }

  listenQuery<T>(path: string, ...constraints: QueryConstraint[]): Observable<FireResponse<T[]>> {
    return new Observable(observer => {
      const col = collection(this.fs, path);
      const q = constraints.length ? query(col, ...constraints) : query(col, limit(50));
      const unsub = onSnapshot(
        q,
        snap => {
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() }) as T);
          observer.next({ ok: true, data });
        },
        err => observer.next({ ok: false, message: err.message }),
      );
      return unsub;
    });
  }

  transaction<T>(fn: (tx: import('@angular/fire/firestore').Transaction) => Promise<T>): Promise<T> {
    return runTransaction(this.fs, fn as (tx: import('@angular/fire/firestore').Transaction) => Promise<T>);
  }

  batch() {
    return writeBatch(this.fs);
  }

  queryConstraints = { where, orderBy, limit };

  collectionGroup(collectionId: string) {
    return collectionGroup(this.fs, collectionId);
  }
}
