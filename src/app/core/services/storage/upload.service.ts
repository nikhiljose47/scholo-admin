import { inject, Injectable } from '@angular/core';
import {
  Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject,
} from '@angular/fire/storage';
import { Auth, getIdToken } from '@angular/fire/auth';
import { environment } from '../../../../environments/environment';

export const MAX_LIVE_IMAGES = 8;
const MAX_LONG_SIDE = 720;
const MAX_AVATAR_SIDE = 256;
const TARGET_BYTES = 150 * 1024;
const TARGET_AVATAR_BYTES = 40 * 1024;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export function avatarPath(uid: string): string {
  return `users/${uid}/avatar.webp`;
}

/** Storage path for one image slot (1..8) of a meeting. Fixed so cleanup is a prefix rule. */
export function liveImagePath(meetingId: string, slot: number): string {
  return `live-class/${meetingId}/${slot}.webp`;
}

/** Public CDN URL of a class's generated preview video, once uploaded to R2. */
export function livePreviewUrl(meetingId: string, extension: 'webm' | 'mp4'): string {
  return `${environment.syllabusApiBaseUrl}/thumbnails/classes/${meetingId}.${extension}`;
}

/** Recover the slot number from a download URL, or null if it isn't one of ours. */
export function slotFromUrl(url: string): number | null {
  const m = /live-class(?:%2F|\/)[^/?%]+(?:%2F|\/)([1-8])\.webp/.exec(url);
  return m ? Number(m[1]) : null;
}

export interface SlotUpload {
  slot: number;
  blob: Blob;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private storage = inject(Storage);
  private auth = inject(Auth);

  /** Resize to ~720px long side and encode as WebP, lowering quality until under ~150 KB. */
  async toWebp(file: File): Promise<Blob> {
    if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
    if (file.size > MAX_INPUT_BYTES) throw new Error(`${file.name} is too large (max 20 MB).`);

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error(`${file.name} could not be read as an image.`);
    }
    try {
      const scale = Math.min(1, MAX_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not available in this browser.');
      ctx.drawImage(bitmap, 0, 0, w, h);

      let blob: Blob | null = null;
      for (const q of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
        blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', q));
        if (!blob) throw new Error('This browser cannot encode WebP images.');
        if (blob.type !== 'image/webp') throw new Error('This browser cannot encode WebP images.');
        if (blob.size <= TARGET_BYTES) break;
      }
      return blob!;
    } finally {
      bitmap.close();
    }
  }

  /** Upload one blob to its slot; resolves with the download URL. */
  uploadSlot(
    meetingId: string,
    slot: number,
    blob: Blob,
    onProgress?: (fraction: number) => void,
  ): Promise<string> {
    const task = uploadBytesResumable(ref(this.storage, liveImagePath(meetingId, slot)), blob, {
      contentType: 'image/webp',
      cacheControl: 'public,max-age=3600',
    });
    return new Promise<string>((resolve, reject) => {
      task.on(
        'state_changed',
        s => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
        err => reject(err),
        () => getDownloadURL(task.snapshot.ref).then(resolve, reject),
      );
    });
  }

  /** Upload the generated class preview as one short muted video to the content-api R2 bucket. */
  async uploadLivePreview(
    meetingId: string,
    blob: Blob,
    mimeType: string,
    onProgress?: (fraction: number) => void,
  ): Promise<string> {
    const extension: 'webm' | 'mp4' = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const user = this.auth.currentUser;
    if (!user) throw new Error('Sign in to upload the class preview.');
    const token = await getIdToken(user, false);

    const url = new URL('/thumbnail', environment.contentApiBaseUrl);
    url.searchParams.set('meetingId', meetingId);
    url.searchParams.set('ext', extension);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url.toString());
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', mimeType);
      xhr.upload.onprogress = e => onProgress?.(e.lengthComputable ? e.loaded / e.total : 0);
      xhr.onerror = () => reject(new Error('Network error while uploading the preview.'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText || xhr.statusText}`));
      };
      xhr.send(blob);
    });

    return livePreviewUrl(meetingId, extension);
  }

  /** Resize to ~256px and encode as WebP for an avatar, then upload; resolves with download URL. */
  async uploadAvatar(uid: string, file: File, onProgress?: (fraction: number) => void): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
    if (file.size > MAX_INPUT_BYTES) throw new Error(`${file.name} is too large (max 20 MB).`);

    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(file); } catch {
      throw new Error(`${file.name} could not be read as an image.`);
    }

    let blob!: Blob;
    try {
      const scale = Math.min(1, MAX_AVATAR_SIDE / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, w, h);
      for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
        const b = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', q));
        if (!b) throw new Error('This browser cannot encode WebP images.');
        blob = b;
        if (b.size <= TARGET_AVATAR_BYTES) break;
      }
    } finally { bitmap.close(); }

    const task = uploadBytesResumable(ref(this.storage, avatarPath(uid)), blob, {
      contentType: 'image/webp', cacheControl: 'public,max-age=86400',
    });
    return new Promise<string>((resolve, reject) => {
      task.on('state_changed',
        s => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
        err => reject(err),
        () => getDownloadURL(task.snapshot.ref).then(resolve, reject),
      );
    });
  }

  /** Delete one slot. A missing object counts as success. */
  async deleteSlot(meetingId: string, slot: number): Promise<void> {
    try {
      await deleteObject(ref(this.storage, liveImagePath(meetingId, slot)));
    } catch (e) {
      if ((e as { code?: string }).code === 'storage/object-not-found') return;
      throw e;
    }
  }
}
