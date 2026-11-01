import { Pipe, PipeTransform, SecurityContext, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { renderSafeMarkdown } from '../utils/safe-markdown';

/**
 * Markdown + math for authored library content. See renderSafeMarkdown for the safety model:
 * the HTML is already safe by construction, Angular's sanitizer runs as a second layer, and only
 * our own KaTeX output (trust: false) is restored afterwards and marked trusted.
 */
@Pipe({
  name: 'safeMarkdown',
  standalone: true,
})
export class SafeMarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    const html = renderSafeMarkdown(value, (h) => this.sanitizer.sanitize(SecurityContext.HTML, h) ?? '');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
