import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { escapeHtml, extractMath, restoreMath } from '../utils/math-render';

/**
 * Plain text with LaTeX math, for what the student typed or pasted. The text is HTML-escaped
 * (no markdown, no tags), so a pasted `<script>` shows as text; only the math is rendered.
 * Line breaks are kept by the bubble's `white-space: pre-wrap`.
 */
@Pipe({
  name: 'mathText',
  standalone: true,
})
export class MathTextPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (!value) {
      return '';
    }

    const extracted = extractMath(value);

    return this.sanitizer.bypassSecurityTrustHtml(
      restoreMath(escapeHtml(extracted.text), extracted),
    );
  }
}
