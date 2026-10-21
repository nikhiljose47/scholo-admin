import { Component, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

// 20×20 viewBox, stroke-linecap="round" stroke-linejoin="round"
const PATHS: Record<string, string> = {
  dashboard:    `<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/>`,
  buildings:    `<path d="M3 18V8.5L10 4l7 4.5V18M8 18v-5h4v5"/>`,
  calendar:     `<rect x="3" y="5" width="14" height="13" rx="2"/><path d="M3 9h14M8 3v4m4-4v4"/>`,
  clipboard:    `<path d="M13 3h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2m3-1h2a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2zm0 8h6M9 14h4"/>`,
  person:       `<circle cx="10" cy="6" r="3"/><path d="M3 19a7 7 0 0 1 14 0"/>`,
  'chart-bar':  `<rect x="3" y="11" width="3" height="6" rx="1"/><rect x="8.5" y="7" width="3" height="10" rx="1"/><rect x="14" y="3" width="3" height="14" rx="1"/>`,
  cog:          `<circle cx="10" cy="10" r="3"/><path d="M10 2v2m0 12v2M2 10h2m12 0h2M4.22 4.22l1.42 1.42m8.72 8.72 1.42 1.42M4.22 15.78l1.42-1.42m8.72-8.72 1.42-1.42"/>`,
  moon:         `<path d="M17.5 12.5A7.5 7.5 0 1 1 10 5a6 6 0 0 0 7.5 7.5z"/>`,
  sun:          `<circle cx="10" cy="10" r="3.5"/><path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.22 3.22l1.42 1.42m10.72 10.72 1.42 1.42M3.22 16.78l1.42-1.42m10.72-10.72 1.42-1.42"/>`,
  logout:       `<path d="M14 4h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3M10 14l4-4-4-4m4 4H3"/>`,
  'chevron-left':  `<path d="M13 4 6 10l7 7"/>`,
  'chevron-right': `<path d="M7 4l7 6-7 7"/>`,
  search:       `<circle cx="9" cy="9" r="5.5"/><path d="m13.5 13.5 4 4"/>`,
  plus:         `<path d="M10 3v14M3 10h14"/>`,
  x:            `<path d="M4 4 16 16M16 4 4 16"/>`,
  check:        `<path d="M3 10.5 7.5 15 17 5"/>`,
  filter:       `<path d="M3 5h14M6 10h8M9 15h2"/>`,
  'arrow-left': `<path d="M17 10H3m0 0 6-6m-6 6 6 6"/>`,
  'eye':        `<ellipse cx="10" cy="10" rx="7" ry="5"/><circle cx="10" cy="10" r="2"/>`,
  'academic-cap': `<path d="M10 2 2 7l8 5 8-5-8-5zM2 7v5M6 9.5v5a8 8 0 0 0 8 0v-5"/>`,
};

@Component({
  selector: 'sc-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [innerHTML]="html()" aria-hidden="true"></span>`,
  styles: [`:host { display: inline-flex; align-items: center; justify-content: center; }
            span { display: inline-flex; align-items: center; }`],
})
export class IconComponent {
  private sanitizer = inject(DomSanitizer);

  name   = input.required<string>();
  size   = input(20);
  stroke = input(1.5);

  html = computed(() => {
    const paths = PATHS[this.name()] ?? '';
    const svg = `<svg width="${this.size()}" height="${this.size()}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="${this.stroke()}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });
}
