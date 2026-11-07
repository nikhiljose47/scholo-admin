import { Injectable } from '@angular/core';

export interface ClassPreviewInput {
  className: string;
  subjectName: string;
  chapterName: string;
  agenda: string[];
  instructions: string[];
  /** New uploads are supplied as blobs so they work before any storage upload. */
  imageSources: Array<string | Blob>;
}

export interface GeneratedClassPreview {
  blob: Blob;
  url: string;
  mimeType: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  fileSizeBytes: number;
}

type Slide =
  | { kind: 'text'; heading: string; body: string }
  | { kind: 'image'; image: ImageBitmap; heading: string; body: string };

const WIDTH = 160;
const HEIGHT = 160;
const FPS = 10;
// Slower pacing makes the small card feel like an ongoing class instead of a quick slideshow.
const DURATION_SECONDS = 36;

/** Builds a small presentation-style preview without ever persisting frames. */
@Injectable({ providedIn: 'root' })
export class ClassPreviewGeneratorService {
  async generate(input: ClassPreviewInput, onProgress?: (fraction: number) => void): Promise<GeneratedClassPreview> {
    if (!('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) {
      throw new Error('This browser cannot create a video preview. Use a recent Chrome, Edge, or Safari browser.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas is not available in this browser.');

    const bitmaps = await this.loadImages(input.imageSources.slice(0, 8));
    const slides = this.buildSlides(input, bitmaps);
    const mimeType = this.selectMimeType();
    if (!mimeType) {
      bitmaps.forEach(image => image.close());
      throw new Error('This browser cannot encode a compact video preview.');
    }

    try {
      const stream = canvas.captureStream(FPS);
      // A modest quality lift while keeping the longer live asset below the 500 KB storage cap.
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 68_000 });
      const chunks: BlobPart[] = [];
      recorder.addEventListener('dataavailable', e => { if (e.data.size) chunks.push(e.data); });
      const result = new Promise<Blob>((resolve, reject) => {
        recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: mimeType })));
        recorder.addEventListener('error', () => reject(new Error('The video preview could not be encoded.')));
      });

      recorder.start(250);
      const startedAt = performance.now();
      await new Promise<void>((resolve) => {
        const render = (now: number) => {
          const elapsed = Math.min((now - startedAt) / 1000, DURATION_SECONDS);
          onProgress?.(elapsed / DURATION_SECONDS);
          this.draw(ctx, slides, elapsed / DURATION_SECONDS);
          if (elapsed < DURATION_SECONDS) requestAnimationFrame(render);
          else resolve();
        };
        requestAnimationFrame(render);
      });
      recorder.stop();
      const blob = await result;
      if (!blob.size) throw new Error('The video preview was empty. Please try again.');
      return { blob, url: URL.createObjectURL(blob), mimeType, durationSeconds: DURATION_SECONDS, width: WIDTH, height: HEIGHT, fps: FPS, fileSizeBytes: blob.size };
    } finally {
      bitmaps.forEach(image => image.close());
    }
  }

  private selectMimeType(): string | null {
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    return candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? null;
  }

  private async loadImages(sources: Array<string | Blob>): Promise<ImageBitmap[]> {
    const results = await Promise.allSettled(sources.map(async source => {
      if (source instanceof Blob) return createImageBitmap(source);
      const response = await fetch(source);
      if (!response.ok) throw new Error('Image could not be loaded');
      return createImageBitmap(await response.blob());
    }));
    return results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  }

  private buildSlides(input: ClassPreviewInput, images: ImageBitmap[]): Slide[] {
    const text = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 74);
    const slides: Slide[] = this.shuffle(images).map(image => ({
      kind: 'image' as const,
      image,
      heading: input.chapterName || 'Live class',
      body: input.subjectName || input.className,
    }));
    const generated: Slide[] = [
      { kind: 'text', heading: input.className || 'Live class', body: text(input.subjectName || 'Learning together') },
      { kind: 'text', heading: input.chapterName || 'Today’s lesson', body: text(input.subjectName || input.className || 'Learning together') },
      ...this.shuffle(input.agenda.filter(Boolean)).map(body => ({ kind: 'text' as const, heading: input.chapterName || 'Learning focus', body: text(body) })),
      ...this.shuffle(input.instructions.filter(Boolean)).map(body => ({ kind: 'text' as const, heading: 'In this class', body: text(body) })),
    ];
    // Always use eight scenes. Photos take priority; the canvas creates the
    // remaining visual lesson cards locally, so no extra image files are stored.
    let cursor = 0;
    while (slides.length < 8) {
      slides.push(generated[cursor % generated.length]);
      cursor++;
    }
    return this.shuffle(slides).slice(0, 8);
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  private draw(ctx: CanvasRenderingContext2D, slides: Slide[], progress: number): void {
    if (!slides.length) return;
    const position = Math.min(Math.max(progress, 0) * slides.length, slides.length - Number.EPSILON);
    const index = Math.max(0, Math.min(slides.length - 1, Math.floor(position)));
    const local = position - Math.floor(position);
    const fade = local > .78 ? (local - .78) / .22 : 0;
    const current = slides[index] ?? slides[0];
    const next = slides[(index + 1) % slides.length] ?? current;
    this.drawSlide(ctx, current, local, 1);
    if (fade) this.drawSlide(ctx, next, local, fade);
  }

  private drawSlide(ctx: CanvasRenderingContext2D, slide: Slide, local: number, alpha: number): void {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (slide.kind === 'image') this.drawImageSlide(ctx, slide, local); else this.drawTextSlide(ctx, slide, local);
    ctx.restore();
  }

  private drawTextSlide(ctx: CanvasRenderingContext2D, slide: Extract<Slide, { kind: 'text' }>, local: number): void {
    ctx.fillStyle = '#2563eb'; ctx.fillRect(14, 14 + Math.sin(local * Math.PI) * 4, 30, 3);
    ctx.fillStyle = '#172554'; ctx.font = '600 9px system-ui, sans-serif'; this.drawWrapped(ctx, slide.heading, 14, 46, 132, 12, 2);
    ctx.fillStyle = '#334155'; ctx.font = '500 13px system-ui, sans-serif'; this.drawWrapped(ctx, slide.body, 14, 80, 132, 17, 4);
    ctx.fillStyle = '#bfdbfe'; ctx.beginPath(); ctx.arc(136, 132, 18 + local * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#dbeafe'; ctx.beginPath(); ctx.arc(148, 142, 10 + local * 2, 0, Math.PI * 2); ctx.fill();
  }

  private drawImageSlide(ctx: CanvasRenderingContext2D, slide: Extract<Slide, { kind: 'image' }>, local: number): void {
    const scale = Math.max(WIDTH / slide.image.width, HEIGHT / slide.image.height) * (1.02 + local * .035);
    const drawW = slide.image.width * scale, drawH = slide.image.height * scale;
    ctx.drawImage(slide.image, (WIDTH - drawW) / 2 + (local - .5) * 4, (HEIGHT - drawH) / 2 + (.5 - local) * 3, drawW, drawH);
    const shade = ctx.createLinearGradient(0, 90, 0, HEIGHT); shade.addColorStop(0, 'rgba(15,23,42,0)'); shade.addColorStop(1, 'rgba(15,23,42,.8)'); ctx.fillStyle = shade; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#fff'; ctx.font = '600 10px system-ui, sans-serif'; this.drawWrapped(ctx, slide.heading, 12, 122, 136, 12, 2);
    ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.font = '500 8px system-ui, sans-serif'; this.drawWrapped(ctx, slide.body, 12, 147, 136, 10, 1);
  }

  private drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): void {
    let line = '', lineNo = 0;
    for (const word of text.split(' ').filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        ctx.fillText(line, x, y + lineNo++ * lineHeight);
        if (lineNo >= maxLines) return;
        line = word;
      } else line = candidate;
    }
    if (line && lineNo < maxLines) ctx.fillText(line, x, y + lineNo * lineHeight);
  }
}
