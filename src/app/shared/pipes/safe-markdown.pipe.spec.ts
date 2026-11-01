import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SafeMarkdownPipe } from './safe-markdown.pipe';
import { MathTextPipe } from './math-text.pipe';

@Component({
  standalone: true,
  imports: [SafeMarkdownPipe, MathTextPipe],
  template: `<div id="md" [innerHTML]="text | safeMarkdown"></div><div id="mt" [innerHTML]="text | mathText"></div>`,
})
class HostComponent {
  text = '';
}

function render(text: string): { md: HTMLElement; mt: HTMLElement } {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.text = text;
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { md: root.querySelector('#md')!, mt: root.querySelector('#mt')! };
}

/** Asserts on the real parsed DOM, not on strings: no active content, no event handlers, no unsafe URLs. */
function expectInert(root: HTMLElement, label: string) {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    expect(['SCRIPT', 'IFRAME', 'STYLE', 'IMG', 'OBJECT', 'EMBED', 'FORM', 'LINK', 'META'].includes(el.tagName))
      .withContext(`${label}: <${el.tagName}>`)
      .toBe(false);
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.toLowerCase().startsWith('on')).withContext(`${label}: ${attr.name}`).toBe(false);
      if (['href', 'src', 'xlink:href', 'action'].includes(attr.name.toLowerCase())) {
        expect(/^(https?:|mailto:)/i.test(attr.value)).withContext(`${label}: ${attr.name}=${attr.value}`).toBe(true);
      }
    }
  }
}

const CORPUS = [
  '<script>window.__pwned = 1</script>',
  '<img src=x onerror="window.__pwned = 1">',
  '![x](https://tracker.example/p.png)',
  '[x](javascript:window.__pwned=1)',
  '[x](JaVaScRiPt:window.__pwned=1)',
  '<a href="javascript:window.__pwned=1">x</a>',
  '<svg onload="window.__pwned=1">',
  '<iframe src="https://evil.example"></iframe>',
  '<details open ontoggle="window.__pwned=1">x</details>',
  '[a](https://e.example "$x$")',
  '$\\href{javascript:window.__pwned=1}{x}$',
  '$\\htmlClass{evil}{x}$',
  '<style>*{display:none}</style>',
];

describe('SafeMarkdownPipe and MathTextPipe in a real DOM', () => {
  beforeEach(() => {
    (window as unknown as { __pwned?: number }).__pwned = 0;
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideZonelessChangeDetection()] });
  });

  it("renders hostile input inertly with Angular's real sanitizer", () => {
    for (const src of CORPUS) {
      const { md, mt } = render(src);
      expectInert(md, `safeMarkdown ${src}`);
      expectInert(mt, `mathText ${src}`);
      expect((window as unknown as { __pwned?: number }).__pwned).toBe(0);
    }
  });

  it('renders inline math, display math, chemistry, multiline steps and a fallback for bad TeX', () => {
    const { md } = render('Solve $x^2+5x+6=0$.\n\n$$\\frac{a}{b}$$\n\nWater: $\\ce{H2O}$\n\nBroken: $\\frac{$ end');
    expect(md.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(3);
    expect(md.querySelector('.katex-display')).not.toBeNull();
    expect(md.querySelector('code.math-error')).not.toBeNull();
    expect(md.textContent).toContain('Solve');
    expect(md.textContent).toContain('end');
  });

  it('mathText escapes tags to text while still rendering math (discussion replies)', () => {
    const { mt } = render('I think <b>this</b> works: $a^2+b^2=c^2$');
    expect(mt.querySelector('b')).toBeNull();
    expect(mt.textContent).toContain('<b>this</b>');
    expect(mt.querySelector('.katex')).not.toBeNull();
  });

  it('keeps only safe links, hardened', () => {
    const { md } = render('[ok](https://scholo.co.in) [bad](javascript:alert(1))');
    const links = Array.from(md.querySelectorAll('a'));
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(links[0].getAttribute('target')).toBe('_blank');
  });
});
