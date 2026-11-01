import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DiagramComponent } from './diagram.component';

const triangle = () => ({
  version: 1,
  kind: 'geometry',
  viewBox: [0, 0, 240, 180],
  elements: [
    { type: 'polygon', points: [[120, 20], [20, 150], [220, 150]], label: 'ABC' },
    { type: 'point', at: [120, 20], label: 'A' },
    { type: 'point', at: [20, 150], label: 'B' },
  ],
  alt: 'Triangle ABC with vertex A above horizontal base BC',
});

function render(spec: unknown): HTMLElement {
  const fixture = TestBed.createComponent(DiagramComponent);
  fixture.componentRef.setInput('spec', spec);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('DiagramComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [DiagramComponent], providers: [provideZonelessChangeDetection()] }));

  it('draws an accessible SVG from the spec using template elements', () => {
    const el = render(triangle());
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Triangle ABC with vertex A above horizontal base BC');
    expect(svg.getAttribute('viewBox')).toBe('0 0 240 180');
    expect(svg.querySelector('title')!.textContent).toBe('Triangle ABC with vertex A above horizontal base BC');
    expect(svg.querySelectorAll('polygon').length).toBe(1);
    expect(svg.querySelectorAll('circle').length).toBe(2);
    expect(Array.from(svg.querySelectorAll('text')).map((t) => t.textContent)).toEqual(['ABC', 'A', 'B']);
    // The elements are really in the SVG namespace, not unknown HTML elements.
    expect(svg.querySelector('polygon')!.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  it('shows hostile labels and alt text as plain text, never as elements or attributes', () => {
    const hostile = '"><img src=x onerror=alert(1)><script>alert(1)</script>';
    const spec = triangle();
    spec.alt = hostile.slice(0, 300);
    (spec.elements[1] as { label: string }).label = hostile.slice(0, 40);
    const el = render(spec);
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toBe(hostile.slice(0, 300));
    for (const node of Array.from(el.querySelectorAll('*'))) {
      for (const attr of Array.from(node.attributes)) {
        expect(attr.name.startsWith('on')).toBe(false);
      }
    }
    expect(el.textContent).toContain('<img');
  });

  it('falls back to alt text for an invalid spec and draws nothing for non-specs', () => {
    const bad = { ...triangle(), elements: [{ type: 'image', href: 'https://evil.example/x.png' }] };
    const el = render(bad);
    expect(el.querySelector('svg')).toBeNull();
    expect(el.querySelector('.diagram-fallback')!.textContent).toContain('Triangle ABC');
    expect(render({ version: 1, kind: 'mermaid', alt: 'x' }).querySelector('svg')).toBeNull();
    for (const junk of [null, undefined, 'string', 42, [], { onload: 'x' }]) {
      expect(render(junk).querySelector('svg')).toBeNull();
    }
  });

  it('renders a graph with axes and a series', () => {
    const el = render({
      version: 1,
      kind: 'graph',
      x: { min: 0, max: 5 },
      y: { min: 0, max: 5 },
      series: [{ points: [[0, 0], [5, 5]], markers: true }],
      alt: 'A line',
    });
    expect(el.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 320 240');
    expect(el.querySelectorAll('polyline').length).toBe(1);
    expect(el.querySelectorAll('line').length).toBe(2);
  });
});
