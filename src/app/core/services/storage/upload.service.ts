import { inject, Injectable } from '@angular/core';
import {
  Storage, ref, uploadBytesResumable, getDownloadURL, deleteObject,
} from '@angular/fire/storage';

export const MAX_LIVE_IMAGES = 4;
const MAX_LONG_SIDE = 720;
const TARGET_BYTES = 150 * 1024;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/** Storage path for one image slot (1..4) of a meeting. Fixed so cleanup is a prefix rule. */
export function liveImagePath(meetingId: string, slot: number): string {
  return `live-class/${meetingId}/${slot}.webp`;
}

/** Recover the slot number from a download URL, or null if it isn't one of ours. */
export function slotFromUrl(url: string): number | null {
  const m = /live-class(?:%2F|\/)[^/?%]+(?:%2F|\/)([1-4])\.webp/.exec(url);
  return m ? Number(m[1]) : null;
}

export interface SlotUpload {
  slot: number;
  blob: Blob;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private storage = inject(Storage);

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
