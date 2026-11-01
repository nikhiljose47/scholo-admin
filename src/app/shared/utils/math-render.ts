import katex from 'katex';
// Adds \ce{...} and \pu{...} (chemical formulas and units) to KaTeX.
import 'katex/contrib/mhchem';

/**
 * Math in chat text: finds LaTeX, renders it with KaTeX, and leaves everything else alone.
 *
 * Accepted delimiters: $...$  $$...$$  \(...\)  \[...\]  and bare \begin{align}...\end{align}
 * style environments (models often omit the delimiters around those).
 *
 * Flow (see MarkdownPipe / MathTextPipe): extractMath -> markdown or escaping -> sanitize ->
 * restoreMath. Math is swapped in AFTER sanitizing, so KaTeX's HTML (inline styles, MathML,
 * SVG) is never run through Angular's sanitizer, which would strip it. The KaTeX HTML comes
 * only from our own renderer with `trust: false`, never from the message text.
 */

export interface MathSpan {
  tex: string;
  display: boolean;
}

export interface ExtractedMath {
  /** Text with every math span replaced by a placeholder token. */
  text: string;
  spans: MathSpan[];
  /** Per-call nonce so message text can never collide with a placeholder. */
  nonce: string;
}

/** Physics-style shorthands students and models commonly use (KaTeX has no `physics` package). */
const MACROS: Record<string, string> = {
  '\\dd': '\\mathrm{d}',
  '\\vb': '\\mathbf{#1}',
  '\\va': '\\vec{\\mathbf{#1}}',
  '\\vu': '\\hat{\\mathbf{#1}}',
  '\\abs': '\\left|#1\\right|',
  '\\norm': '\\left\\|#1\\right\\|',
  '\\qty': '\\left(#1\\right)',
  '\\grad': '\\nabla',
  '\\curl': '\\nabla\\times',
  '\\divg': '\\nabla\\cdot',
  '\\laplacian': '\\nabla^{2}',
  '\\dv': '\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}',
  '\\pdv': '\\frac{\\partial #1}{\\partial #2}',
  '\\ev': '\\left\\langle #1\\right\\rangle',
  '\\bra': '\\left\\langle #1\\right|',
  '\\ket': '\\left|#1\\right\\rangle',
  '\\braket': '\\left\\langle #1\\middle|#2\\right\\rangle',
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\Q': '\\mathbb{Q}',
  '\\C': '\\mathbb{C}',
  '\\degree': '^{\\circ}',
  '\\celsius': '^{\\circ}\\mathrm{C}',
};

/** Environments that are display math even without $$ around them. */
const BARE_ENVIRONMENTS = [
  'align',
  'align*',
  'alignat',
  'alignat*',
  'equation',
  'equation*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'eqnarray',
  'eqnarray*',
];

/** Guards against pathological input: one span never renders more than this much TeX. */
const MAX_TEX_LENGTH = 4000;
const MAX_SPANS = 200;

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function renderMathSpan(span: MathSpan): string {
  const tex = span.tex.trim();

  if (!tex || tex.length > MAX_TEX_LENGTH) {
    return `<code class="math-error">${escapeHtml(span.tex)}</code>`;
  }

  try {
    return katex.renderToString(tex, {
      displayMode: span.display,
      throwOnError: true,
      strict: 'ignore',
      trust: false,
      output: 'htmlAndMathml',
      macros: { ...MACROS },
      maxExpand: 1000,
      maxSize: 50,
    });
  } catch {
    // Unparseable (or half-typed) TeX: show the source instead of an error colour.
    return `<code class="math-error">${escapeHtml(span.tex)}</code>`;
  }
}

function isSpace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

/** Index of an unescaped `needle` at or after `from`, or -1. */
function findClosing(text: string, needle: string, from: number): number {
  let index = from;

  while (index < text.length) {
    const found = text.indexOf(needle, index);

    if (found === -1) {
      return -1;
    }

    let backslashes = 0;
    for (let k = found - 1; k >= 0 && text[k] === '\\'; k--) {
      backslashes++;
    }

    if (backslashes % 2 === 0) {
      return found;
    }

    index = found + 1;
  }

  return -1;
}

/** End index (exclusive) of an inline `$...$` that starts at `start`, or -1 when it is not math. */
function findInlineDollarEnd(text: string, start: number): number {
  // Opening `$` must be followed by a non-space ("$5 and $10" is money, not math).
  if (isSpace(text[start + 1]) || text[start + 1] === '$') {
    return -1;
  }

  // Inline math closes at the very next `$`. If that one is not a valid closer, the opening
  // `$` was money or plain text ("$5 for $x$" must not pair the first `$` with the last).
  const found = findClosing(text, '$', start + 1);

  if (found === -1) {
    return -1;
  }

  // Inline math never crosses a blank line.
  if (/\n\s*\n/.test(text.slice(start, found))) {
    return -1;
  }

  // Closing `$` must follow a non-space and must not be followed by a digit.
  if (isSpace(text[found - 1]) || isDigit(text[found + 1])) {
    return -1;
  }

  return found + 1;
}

export function extractMath(source: string): ExtractedMath {
  const nonce = Math.random().toString(36).slice(2, 8);
  const spans: MathSpan[] = [];
  let out = '';
  let i = 0;

  const push = (tex: string, display: boolean): void => {
    out += `KTXM${nonce}N${spans.length}KTXEND`;
    spans.push({ tex, display });
  };

  while (i < source.length) {
    const rest = source.slice(i);

    // Code is never math: fenced blocks and inline code are copied verbatim.
    if (rest.startsWith('```')) {
      const end = source.indexOf('```', i + 3);
      const stop = end === -1 ? source.length : end + 3;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }

    if (rest.startsWith('`')) {
      const run = /^`+/.exec(rest)![0];
      const end = source.indexOf(run, i + run.length);
      const stop = end === -1 ? i + run.length : end + run.length;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }

    if (spans.length < MAX_SPANS) {
      if (rest.startsWith('$$')) {
        const end = findClosing(source, '$$', i + 2);

        if (end !== -1) {
          push(source.slice(i + 2, end), true);
          i = end + 2;
          continue;
        }
      }

      if (rest.startsWith('\\[')) {
        const end = findClosing(source, '\\]', i + 2);

        if (end !== -1) {
          push(source.slice(i + 2, end), true);
          i = end + 2;
          continue;
        }
      }

      if (rest.startsWith('\\(')) {
        const end = findClosing(source, '\\)', i + 2);

        if (end !== -1) {
          push(source.slice(i + 2, end), false);
          i = end + 2;
          continue;
        }
      }

      if (rest.startsWith('\\begin{')) {
        const env = /^\\begin\{([^}]+)\}/.exec(rest)?.[1];

        if (env && BARE_ENVIRONMENTS.includes(env)) {
          const closer = `\\end{${env}}`;
          const end = source.indexOf(closer, i);

          if (end !== -1) {
            push(source.slice(i, end + closer.length), true);
            i = end + closer.length;
            continue;
          }
        }
      }

      if (rest.startsWith('$') && source[i - 1] !== '\\') {
        const end = findInlineDollarEnd(source, i);

        if (end !== -1) {
          push(source.slice(i + 1, end - 1), false);
          i = end;
          continue;
        }
      }
    }

    out += source[i];
    i++;
  }

  return { text: out, spans, nonce };
}

/**
 * Swaps each placeholder for its rendered KaTeX HTML. Call this on already-sanitized HTML.
 *
 * A placeholder is only restored in text position. If one ended up inside a tag (for example in a
 * link `title` attribute, which markdown lets a student write), it is dropped instead: KaTeX HTML
 * contains quotes, so restoring it there would break out of the attribute.
 */
export function restoreMath(html: string, extracted: ExtractedMath): string {
  if (!extracted.spans.length) {
    return html;
  }

  const placeholder = `KTXM${extracted.nonce}N(\\d+)KTXEND`;
  const inTag = new RegExp(placeholder, 'g');

  return html.replace(new RegExp(`(<[^>]*>)|${placeholder}`, 'g'), (_match, tag: string | undefined, index: string) => {
    if (tag !== undefined) {
      return tag.replace(inTag, '');
    }

    const span = extracted.spans[Number(index)];
    return span ? renderMathSpan(span) : '';
  });
}
