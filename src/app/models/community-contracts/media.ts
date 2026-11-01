// Copied from nikhiljose47/free-online-tutor packages/community-contracts/src/media.ts
// at commit 8aa3927cbafd9a1b76f8ce343a4565a727f95d58 -- keep in sync manually.
// Media for the Problem Library: raster images only (PNG, JPEG, WebP), identified by content hash.
// SVG is rejected on purpose: an uploaded SVG can carry script and active content. Simple diagrams use
// DiagramSpec; complex images are raster files that are sniffed by their bytes (never by the client's
// claimed type or filename) and served with nosniff and a sandboxing CSP.
import type { ProblemSource } from './problem-library';

export const MEDIA_LIMITS = {
  maxBytes: 1_000_000,
  maxDimension: 4096,
  maxAlt: 200,
  maxPerProblem: 5,
} as const;

export const MEDIA_ID_PATTERN = /^m-[0-9a-f]{20}$/;

export type MediaMime = 'image/png' | 'image/jpeg' | 'image/webp';
export type MediaExt = 'png' | 'jpg' | 'webp';

export interface MediaRecord {
  id: string;
  mime: MediaMime;
  ext: MediaExt;
  bytes: number;
  width: number;
  height: number;
  sha256: string;
  alt: string;
  source: ProblemSource;
  createdAt: string;
}

/** What the public API returns for a media reference (no hashes, uploader or storage keys). */
export interface PublicMedia {
  id: string;
  /** Path relative to the API base, e.g. /v1/public/community/media/m-... */
  url: string;
  mime: MediaMime;
  width: number;
  height: number;
  alt: string;
  license: string;
  attribution: string | null;
}

export const mediaId = (sha256Hex: string): string => `m-${sha256Hex.slice(0, 20)}`;
export const mediaUrl = (id: string): string => `/v1/public/community/media/${id}`;

export function toPublicMedia(m: MediaRecord): PublicMedia {
  return {
    id: m.id,
    url: mediaUrl(m.id),
    mime: m.mime,
    width: m.width,
    height: m.height,
    alt: m.alt,
    license: m.source.license,
    attribution: m.source.attribution,
  };
}

export interface DetectedImage {
  mime: MediaMime;
  ext: MediaExt;
  width: number;
  height: number;
}

export type DetectResult = { ok: true; image: DetectedImage } | { ok: false; code: 'UNSUPPORTED_TYPE' | 'INVALID_IMAGE'; message: string };

const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const ascii = (b: Uint8Array, o: number, n: number): string => String.fromCharCode(...b.slice(o, o + n));

function finish(mime: MediaMime, ext: MediaExt, width: number, height: number): DetectResult {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return { ok: false, code: 'INVALID_IMAGE', message: 'Image dimensions could not be read' };
  }
  if (width > MEDIA_LIMITS.maxDimension || height > MEDIA_LIMITS.maxDimension) {
    return { ok: false, code: 'INVALID_IMAGE', message: `Image is larger than ${MEDIA_LIMITS.maxDimension}px on a side` };
  }
  return { ok: true, image: { mime, ext, width, height } };
}

function png(b: Uint8Array): DetectResult {
  if (b.length < 33 || ascii(b, 12, 4) !== 'IHDR') return { ok: false, code: 'INVALID_IMAGE', message: 'Corrupt PNG header' };
  return finish('image/png', 'png', u32(b, 16), u32(b, 20));
}

function jpeg(b: Uint8Array): DetectResult {
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) return { ok: false, code: 'INVALID_IMAGE', message: 'Corrupt JPEG' };
    const marker = b[o + 1];
    if (marker === 0xff) { o++; continue; }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return finish('image/jpeg', 'jpg', u16(b, o + 7), u16(b, o + 5));
    if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan without a frame header
    o += 2 + u16(b, o + 2);
  }
  return { ok: false, code: 'INVALID_IMAGE', message: 'JPEG dimensions could not be read' };
}

function webp(b: Uint8Array): DetectResult {
  if (b.length < 25) return { ok: false, code: 'INVALID_IMAGE', message: 'Corrupt WebP' };
  const chunk = ascii(b, 12, 4);
  // A 1x1 lossless WebP is only ~26 bytes, so the minimum length depends on the chunk type.
  if ((chunk === 'VP8 ' || chunk === 'VP8X') && b.length < 30) return { ok: false, code: 'INVALID_IMAGE', message: 'Corrupt WebP' };
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return { ok: false, code: 'INVALID_IMAGE', message: 'Corrupt WebP' };
    return finish('image/webp', 'webp', (b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff);
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return { ok: false, code: 'INVALID_IMAGE', message: 'Corrupt WebP' };
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return finish('image/webp', 'webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === 'VP8X') {
    if (b[20] & 0x02) return { ok: false, code: 'UNSUPPORTED_TYPE', message: 'Animated WebP is not accepted' };
    return finish('image/webp', 'webp', (b[24] | (b[25] << 8) | (b[26] << 16)) + 1, (b[27] | (b[28] << 8) | (b[29] << 16)) + 1);
  }
  return { ok: false, code: 'INVALID_IMAGE', message: 'Unrecognised WebP data' };
}

/** Identifies an image from its bytes. The caller's declared Content-Type and filename are never used. */
export function detectImage(b: Uint8Array): DetectResult {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return png(b);
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpeg(b);
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return webp(b);
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.includes('<svg')) {
    return { ok: false, code: 'UNSUPPORTED_TYPE', message: 'SVG uploads are not accepted (they can contain script). Use a DiagramSpec for simple diagrams, or export a PNG/WebP.' };
  }
  return { ok: false, code: 'UNSUPPORTED_TYPE', message: 'Only PNG, JPEG and WebP images are accepted' };
}
