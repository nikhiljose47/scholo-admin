import { Marked } from 'marked';
import { escapeHtml, extractMath, restoreMath } from './math-render';

/**
 * Markdown + LaTeX for authored library content (problem statements, answers, explanations).
 *
 * Unlike the AI-chat MarkdownPipe this is safe by construction rather than by sanitizing afterwards:
 *  - raw HTML in the source is shown as text, never emitted as markup;
 *  - images are dropped (diagrams are DiagramSpecs, photos are uploaded media with alt text) so a
 *    problem cannot make a student's browser call a third-party server;
 *  - links are kept only for http(s) and mailto, and always get rel=noopener noreferrer nofollow.
 * It uses its own Marked instance so the global marked options used by MarkdownPipe are untouched.
 * `sanitize` is an optional second layer (the pipe passes Angular's DomSanitizer) applied BEFORE the
 * KaTeX HTML is restored, because KaTeX output would not survive Angular's sanitizer.
 */
const SAFE_LINK = /^(https?:|mailto:)/i;
const MAX_INPUT_LENGTH = 30_000;

const safeMarked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    image({ text }) {
      return escapeHtml(text);
    },
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens);
      const target = (href ?? '').trim();
      if (!SAFE_LINK.test(target)) {
        return label;
      }
      return `<a href="${escapeHtml(target)}" rel="noopener noreferrer nofollow" target="_blank">${label}</a>`;
    },
  },
});

export function renderSafeMarkdown(
  value: string | null | undefined,
  sanitize: (html: string) => string = (html) => html,
): string {
  // Content comes from an API: anything that is not text renders as nothing rather than throwing during SSR.
  if (!value || typeof value !== 'string') {
    return '';
  }

  const extracted = extractMath(value.slice(0, MAX_INPUT_LENGTH));
  const html = safeMarked.parse(extracted.text, { async: false }) as string;

  return restoreMath(sanitize(html), extracted);
}
