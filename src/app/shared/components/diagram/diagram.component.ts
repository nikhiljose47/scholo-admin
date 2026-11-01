import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  layoutDiagram,
  validateDiagramSpec,
  type SvgPrimitive,
} from '../../../models/community-contracts/diagram-spec';

/**
 * Renders a DiagramSpec as SVG using Angular template elements only. There is no innerHTML, no
 * bypassSecurityTrust*, and no author-controlled attribute: the spec is validated again here and
 * reduced to numbers and enumerated tokens, and labels are interpolated as text. An invalid spec
 * degrades to its alt text. Renders identically on the server and the client (no measuring).
 */
@Component({
  selector: 'app-diagram',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (layout(); as l) {
      <svg
        class="diagram"
        role="img"
        preserveAspectRatio="xMidYMid meet"
        [attr.viewBox]="'0 0 ' + l.width + ' ' + l.height"
        [attr.aria-label]="l.alt"
      >
        <title>{{ l.alt }}</title>
        @for (p of l.primitives; track $index) {
          @if (p.tag === 'line') {
            <line [attr.x1]="p.x1" [attr.y1]="p.y1" [attr.x2]="p.x2" [attr.y2]="p.y2" [class]="paint(p)" [attr.stroke-dasharray]="p.dash" />
          } @else if (p.tag === 'polyline') {
            <polyline [attr.points]="p.points" [class]="paint(p)" [attr.stroke-dasharray]="p.dash" />
          } @else if (p.tag === 'polygon') {
            <polygon [attr.points]="p.points" [class]="paint(p)" [attr.stroke-dasharray]="p.dash" />
          } @else if (p.tag === 'circle') {
            <circle [attr.cx]="p.cx" [attr.cy]="p.cy" [attr.r]="p.r" [class]="paint(p)" [attr.stroke-dasharray]="p.dash" />
          } @else {
            <text [attr.x]="p.x" [attr.y]="p.y" [attr.text-anchor]="p.anchor" [class]="'t t-' + p.color">{{ p.text }}</text>
          }
        }
      </svg>
    } @else if (fallbackAlt(); as alt) {
      <p class="diagram-fallback">{{ alt }}</p>
    }
  `,
  styles: `
    :host { display: block; max-width: 28rem; }
    .diagram { width: 100%; height: auto; display: block; }
    .diagram-fallback { margin: 0; font-style: italic; color: var(--bs-secondary-color, #6b7280); }
    .diagram line, .diagram polyline, .diagram polygon, .diagram circle { stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
    .diagram polyline { fill: none; }
    .t { font-size: 12px; fill: currentColor; }
    .s-ink { stroke: currentColor; }
    .s-muted { stroke: #6b7280; }
    .s-accent { stroke: #4f46e5; }
    .s-success { stroke: #15803d; }
    .s-danger { stroke: #b91c1c; }
    .f-none { fill: none; }
    .f-muted { fill: #6b7280; fill-opacity: 0.18; }
    .f-accent { fill: #4f46e5; fill-opacity: 0.18; }
    .f-success { fill: #15803d; fill-opacity: 0.18; }
    .f-danger { fill: #b91c1c; fill-opacity: 0.18; }
    .t-ink { fill: currentColor; }
    .t-muted { fill: #6b7280; }
    .t-accent { fill: #4f46e5; }
    .t-success { fill: #15803d; }
    .t-danger { fill: #b91c1c; }
  `,
})
export class DiagramComponent {
  /** An untrusted DiagramSpec (from the public API). Validated before anything is drawn. */
  readonly spec = input<unknown>(null);

  protected readonly layout = computed(() => {
    const result = validateDiagramSpec(this.spec());
    return result.ok ? layoutDiagram(result.value) : null;
  });

  protected readonly fallbackAlt = computed(() => {
    const raw = this.spec();
    const alt = typeof raw === 'object' && raw !== null ? (raw as { alt?: unknown }).alt : null;
    return typeof alt === 'string' ? alt.slice(0, 300) : null;
  });

  protected paint(p: Exclude<SvgPrimitive, { tag: 'text' }>): string {
    return `s-${p.stroke} f-${p.fill}`;
  }
}
