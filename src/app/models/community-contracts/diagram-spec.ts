// Copied from nikhiljose47/free-online-tutor packages/community-contracts/src/diagram-spec.ts
// at commit 8aa3927cbafd9a1b76f8ce343a4565a727f95d58 -- keep in sync manually.
// DiagramSpec: a deliberately narrow, data-only description of simple geometry and graph diagrams.
// It is validated on import and again before rendering, and rendered to SVG *primitives* (numbers and
// enumerated tokens only), so nothing an author writes can become markup, script, CSS or a URL.
// Pure TypeScript: shared by the importer (Worker), the Angular renderer and tests.

export const DIAGRAM_LIMITS = {
  maxPerProblem: 3,
  maxElements: 60,
  maxPointsPerShape: 200,
  maxTotalPoints: 600,
  maxSeries: 4,
  maxLabel: 40,
  maxAlt: 300,
  minView: 50,
  maxView: 1000,
  maxAxisMagnitude: 1_000_000,
  maxBytes: 20_000,
} as const;

export const DIAGRAM_COLORS = ['ink', 'muted', 'accent', 'success', 'danger'] as const;
export type DiagramColor = (typeof DIAGRAM_COLORS)[number];
export const DIAGRAM_STROKES = ['solid', 'dashed', 'dotted'] as const;
export type DiagramStroke = (typeof DIAGRAM_STROKES)[number];
export const DIAGRAM_FILLS = ['none', 'muted', 'accent', 'success', 'danger'] as const;
export type DiagramFill = (typeof DIAGRAM_FILLS)[number];
export const DIAGRAM_ANCHORS = ['start', 'middle', 'end'] as const;
export type DiagramAnchor = (typeof DIAGRAM_ANCHORS)[number];

export type Pt = [number, number];

export type GeometryElement =
  | { type: 'line'; from: Pt; to: Pt; stroke?: DiagramStroke; color?: DiagramColor; label?: string }
  | { type: 'polyline'; points: Pt[]; stroke?: DiagramStroke; color?: DiagramColor }
  | { type: 'polygon'; points: Pt[]; fill?: DiagramFill; stroke?: DiagramStroke; color?: DiagramColor; label?: string }
  | { type: 'circle'; center: Pt; r: number; fill?: DiagramFill; stroke?: DiagramStroke; color?: DiagramColor; label?: string }
  | { type: 'point'; at: Pt; color?: DiagramColor; label?: string }
  | { type: 'text'; at: Pt; text: string; anchor?: DiagramAnchor; color?: DiagramColor };

export interface GeometrySpec {
  version: 1;
  kind: 'geometry';
  viewBox: [0, 0, number, number];
  elements: GeometryElement[];
  alt: string;
}

export interface GraphSeries {
  points: Pt[];
  color?: DiagramColor;
  stroke?: DiagramStroke;
  markers?: boolean;
  label?: string;
}

export interface GraphSpec {
  version: 1;
  kind: 'graph';
  x: { min: number; max: number; label?: string };
  y: { min: number; max: number; label?: string };
  series: GraphSeries[];
  alt: string;
}

export type DiagramSpec = GeometrySpec | GraphSpec;

export type SpecResult = { ok: true; value: DiagramSpec } | { ok: false; errors: string[] };

// ---------------------------------------------------------------- validation

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\u0000-\u001f\u007f-\u009f\u2028\u2029]');

class Ctx {
  errors: string[] = [];
  totalPoints = 0;
  err(path: string, message: string): void {
    if (this.errors.length < 50) this.errors.push(`${path}: ${message}`);
  }
}

function checkKeys(c: Ctx, path: string, obj: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) c.err(path, `unknown property "${key.slice(0, 30)}"`);
}

function checkNumber(c: Ctx, path: string, v: unknown, min: number, max: number): v is number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    c.err(path, 'must be a finite number');
    return false;
  }
  if (v < min || v > max) {
    c.err(path, `must be between ${min} and ${max} (got ${v})`);
    return false;
  }
  return true;
}

function checkText(c: Ctx, path: string, v: unknown, max: number): v is string {
  if (typeof v !== 'string' || v.trim() === '') {
    c.err(path, 'must be a non-empty string');
    return false;
  }
  if (v.length > max) c.err(path, `must be at most ${max} characters`);
  if (CONTROL_CHARS.test(v)) c.err(path, 'must not contain control characters');
  return true;
}

function checkEnum<T extends string>(c: Ctx, path: string, v: unknown, allowed: readonly T[]): void {
  if (v !== undefined && !allowed.includes(v as T)) c.err(path, `must be one of ${allowed.join(', ')}`);
}

function checkPoint(c: Ctx, path: string, v: unknown, xr: [number, number], yr: [number, number]): void {
  if (!Array.isArray(v) || v.length !== 2) {
    c.err(path, 'must be a [x, y] pair');
    return;
  }
  checkNumber(c, `${path}[0]`, v[0], xr[0], xr[1]);
  checkNumber(c, `${path}[1]`, v[1], yr[0], yr[1]);
}

function checkPoints(c: Ctx, path: string, v: unknown, min: number, xr: [number, number], yr: [number, number]): void {
  if (!Array.isArray(v) || v.length < min || v.length > DIAGRAM_LIMITS.maxPointsPerShape) {
    c.err(path, `must be an array of ${min}-${DIAGRAM_LIMITS.maxPointsPerShape} points`);
    return;
  }
  c.totalPoints += v.length;
  v.forEach((p, i) => checkPoint(c, `${path}[${i}]`, p, xr, yr));
}

const STYLE_KEYS = ['stroke', 'color', 'fill', 'label'] as const;

function checkGeometryElement(c: Ctx, path: string, el: unknown, w: number, h: number): void {
  if (!isObject(el)) {
    c.err(path, 'must be an object');
    return;
  }
  const xr: [number, number] = [0, w];
  const yr: [number, number] = [0, h];
  const type = el['type'];
  const common = ['type', ...STYLE_KEYS];
  checkEnum(c, `${path}.stroke`, el['stroke'], DIAGRAM_STROKES);
  checkEnum(c, `${path}.color`, el['color'], DIAGRAM_COLORS);
  checkEnum(c, `${path}.fill`, el['fill'], DIAGRAM_FILLS);
  if (el['label'] !== undefined) checkText(c, `${path}.label`, el['label'], DIAGRAM_LIMITS.maxLabel);

  switch (type) {
    case 'line':
      checkKeys(c, path, el, ['type', 'from', 'to', 'stroke', 'color', 'label']);
      checkPoint(c, `${path}.from`, el['from'], xr, yr);
      checkPoint(c, `${path}.to`, el['to'], xr, yr);
      break;
    case 'polyline':
      checkKeys(c, path, el, ['type', 'points', 'stroke', 'color']);
      checkPoints(c, `${path}.points`, el['points'], 2, xr, yr);
      break;
    case 'polygon':
      checkKeys(c, path, el, [...common, 'points']);
      checkPoints(c, `${path}.points`, el['points'], 3, xr, yr);
      break;
    case 'circle':
      checkKeys(c, path, el, [...common, 'center', 'r']);
      checkPoint(c, `${path}.center`, el['center'], xr, yr);
      checkNumber(c, `${path}.r`, el['r'], 0.5, Math.max(w, h));
      break;
    case 'point':
      checkKeys(c, path, el, ['type', 'at', 'color', 'label']);
      checkPoint(c, `${path}.at`, el['at'], xr, yr);
      break;
    case 'text':
      checkKeys(c, path, el, ['type', 'at', 'text', 'anchor', 'color']);
      checkPoint(c, `${path}.at`, el['at'], xr, yr);
      checkText(c, `${path}.text`, el['text'], DIAGRAM_LIMITS.maxLabel);
      checkEnum(c, `${path}.anchor`, el['anchor'], DIAGRAM_ANCHORS);
      break;
    default:
      c.err(`${path}.type`, 'must be one of line, polyline, polygon, circle, point, text');
  }
}

function checkAxis(c: Ctx, path: string, v: unknown): [number, number] {
  if (!isObject(v)) {
    c.err(path, 'must be an object {min, max}');
    return [0, 1];
  }
  checkKeys(c, path, v, ['min', 'max', 'label']);
  const m = DIAGRAM_LIMITS.maxAxisMagnitude;
  const okMin = checkNumber(c, `${path}.min`, v['min'], -m, m);
  const okMax = checkNumber(c, `${path}.max`, v['max'], -m, m);
  if (okMin && okMax && (v['min'] as number) >= (v['max'] as number)) c.err(path, 'min must be less than max');
  if (v['label'] !== undefined) checkText(c, `${path}.label`, v['label'], DIAGRAM_LIMITS.maxLabel);
  return okMin && okMax ? [v['min'] as number, v['max'] as number] : [0, 1];
}

/** Validates an untrusted DiagramSpec. Errors name the exact path, e.g. `elements[2].points[1][0]: must be between 0 and 240`. */
export function validateDiagramSpec(input: unknown): SpecResult {
  const c = new Ctx();
  if (!isObject(input)) return { ok: false, errors: ['diagram: must be an object'] };
  try {
    if (JSON.stringify(input).length > DIAGRAM_LIMITS.maxBytes) {
      return { ok: false, errors: [`diagram: exceeds ${DIAGRAM_LIMITS.maxBytes} bytes`] };
    }
  } catch {
    return { ok: false, errors: ['diagram: is not plain JSON data'] };
  }
  if (input['version'] !== 1) c.err('version', 'must be 1');
  checkText(c, 'alt', input['alt'], DIAGRAM_LIMITS.maxAlt);
  const kind = input['kind'];

  if (kind === 'geometry') {
    checkKeys(c, 'diagram', input, ['version', 'kind', 'viewBox', 'elements', 'alt']);
    const vb = input['viewBox'];
    let w = 0;
    let h = 0;
    if (!Array.isArray(vb) || vb.length !== 4 || vb[0] !== 0 || vb[1] !== 0) c.err('viewBox', 'must be [0, 0, width, height]');
    else if (checkNumber(c, 'viewBox[2]', vb[2], DIAGRAM_LIMITS.minView, DIAGRAM_LIMITS.maxView) && checkNumber(c, 'viewBox[3]', vb[3], DIAGRAM_LIMITS.minView, DIAGRAM_LIMITS.maxView)) {
      w = vb[2] as number;
      h = vb[3] as number;
    }
    const els = input['elements'];
    if (!Array.isArray(els) || els.length === 0 || els.length > DIAGRAM_LIMITS.maxElements) {
      c.err('elements', `must be an array of 1-${DIAGRAM_LIMITS.maxElements} elements`);
    } else if (w > 0) {
      els.forEach((el, i) => checkGeometryElement(c, `elements[${i}]`, el, w, h));
    }
  } else if (kind === 'graph') {
    checkKeys(c, 'diagram', input, ['version', 'kind', 'x', 'y', 'series', 'alt']);
    const xr = checkAxis(c, 'x', input['x']);
    const yr = checkAxis(c, 'y', input['y']);
    const series = input['series'];
    if (!Array.isArray(series) || series.length === 0 || series.length > DIAGRAM_LIMITS.maxSeries) {
      c.err('series', `must be an array of 1-${DIAGRAM_LIMITS.maxSeries} series`);
    } else {
      series.forEach((s, i) => {
        const p = `series[${i}]`;
        if (!isObject(s)) return c.err(p, 'must be an object');
        checkKeys(c, p, s, ['points', 'color', 'stroke', 'markers', 'label']);
        checkPoints(c, `${p}.points`, s['points'], 2, xr, yr);
        checkEnum(c, `${p}.color`, s['color'], DIAGRAM_COLORS);
        checkEnum(c, `${p}.stroke`, s['stroke'], DIAGRAM_STROKES);
        if (s['markers'] !== undefined && typeof s['markers'] !== 'boolean') c.err(`${p}.markers`, 'must be true or false');
        if (s['label'] !== undefined) checkText(c, `${p}.label`, s['label'], DIAGRAM_LIMITS.maxLabel);
      });
    }
  } else {
    c.err('kind', 'must be "geometry" or "graph"');
  }

  if (c.totalPoints > DIAGRAM_LIMITS.maxTotalPoints) c.err('diagram', `has ${c.totalPoints} points; the limit is ${DIAGRAM_LIMITS.maxTotalPoints}`);
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: input as unknown as DiagramSpec };
}

// ---------------------------------------------------------------- layout to SVG primitives

interface Paint {
  stroke: DiagramColor;
  fill: DiagramFill;
  dash: string | null;
}

export type SvgPrimitive =
  | ({ tag: 'line'; x1: number; y1: number; x2: number; y2: number } & Paint)
  | ({ tag: 'polyline'; points: string } & Paint)
  | ({ tag: 'polygon'; points: string } & Paint)
  | ({ tag: 'circle'; cx: number; cy: number; r: number } & Paint)
  | { tag: 'text'; x: number; y: number; text: string; anchor: DiagramAnchor; color: DiagramColor };

export interface DiagramLayout {
  width: number;
  height: number;
  alt: string;
  primitives: SvgPrimitive[];
}

const DASH: Record<DiagramStroke, string | null> = { solid: null, dashed: '6 4', dotted: '1.5 4' };
const round = (n: number): number => Math.round(n * 100) / 100;
const pts = (list: Pt[]): string => list.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');

export function formatTick(n: number): string {
  return String(Number(n.toFixed(3)));
}

function clampX(x: number, w: number): number {
  return round(Math.min(Math.max(x, 4), w - 4));
}
function clampY(y: number, h: number): number {
  return round(Math.min(Math.max(y, 11), h - 4));
}

function label(text: string, x: number, y: number, w: number, h: number, color: DiagramColor = 'ink', anchor: DiagramAnchor = 'start'): SvgPrimitive {
  return { tag: 'text', x: clampX(x, w), y: clampY(y, h), text, anchor, color };
}

function geometryLayout(spec: GeometrySpec): DiagramLayout {
  const [, , w, h] = spec.viewBox;
  const out: SvgPrimitive[] = [];
  for (const el of spec.elements) {
    const stroke = el.type === 'point' || el.type === 'text' ? (el.color ?? 'ink') : (el.color ?? 'ink');
    const dash = 'stroke' in el ? DASH[el.stroke ?? 'solid'] : null;
    switch (el.type) {
      case 'line':
        out.push({ tag: 'line', x1: round(el.from[0]), y1: round(el.from[1]), x2: round(el.to[0]), y2: round(el.to[1]), stroke, fill: 'none', dash });
        if (el.label) out.push(label(el.label, (el.from[0] + el.to[0]) / 2 + 6, (el.from[1] + el.to[1]) / 2 - 6, w, h, stroke));
        break;
      case 'polyline':
        out.push({ tag: 'polyline', points: pts(el.points), stroke, fill: 'none', dash });
        break;
      case 'polygon': {
        out.push({ tag: 'polygon', points: pts(el.points), stroke, fill: el.fill ?? 'none', dash });
        if (el.label) {
          const cx = el.points.reduce((s, p) => s + p[0], 0) / el.points.length;
          const cy = el.points.reduce((s, p) => s + p[1], 0) / el.points.length;
          out.push(label(el.label, cx, cy, w, h, stroke, 'middle'));
        }
        break;
      }
      case 'circle':
        out.push({ tag: 'circle', cx: round(el.center[0]), cy: round(el.center[1]), r: round(el.r), stroke, fill: el.fill ?? 'none', dash });
        if (el.label) out.push(label(el.label, el.center[0], el.center[1], w, h, stroke, 'middle'));
        break;
      case 'point':
        out.push({ tag: 'circle', cx: round(el.at[0]), cy: round(el.at[1]), r: 3, stroke, fill: stroke === 'ink' ? 'muted' : (stroke as DiagramFill), dash: null });
        if (el.label) out.push(label(el.label, el.at[0] + 6, el.at[1] - 6, w, h, stroke));
        break;
      case 'text':
        out.push(label(el.text, el.at[0], el.at[1], w, h, el.color ?? 'ink', el.anchor ?? 'start'));
        break;
    }
  }
  return { width: w, height: h, alt: spec.alt, primitives: out };
}

const GRAPH_W = 320;
const GRAPH_H = 240;

function graphLayout(spec: GraphSpec): DiagramLayout {
  const L = 40, R = 14, T = 14, B = 32;
  const pw = GRAPH_W - L - R;
  const ph = GRAPH_H - T - B;
  const { x, y } = spec;
  const px = (v: number) => round(L + ((v - x.min) / (x.max - x.min)) * pw);
  const py = (v: number) => round(T + ((y.max - v) / (y.max - y.min)) * ph);
  const out: SvgPrimitive[] = [];

  // Axes cross at zero when zero is in range, otherwise sit on the lower/left edge.
  const axisY = y.min <= 0 && y.max >= 0 ? py(0) : py(y.min);
  const axisX = x.min <= 0 && x.max >= 0 ? px(0) : px(x.min);
  const base: Paint = { stroke: 'muted', fill: 'none', dash: null };
  out.push({ tag: 'line', x1: L, y1: axisY, x2: L + pw, y2: axisY, ...base, stroke: 'ink' });
  out.push({ tag: 'line', x1: axisX, y1: T, x2: axisX, y2: T + ph, ...base, stroke: 'ink' });
  // Light frame so the plot area reads even when the axes cross in the middle.
  out.push({ tag: 'polygon', points: pts([[L, T], [L + pw, T], [L + pw, T + ph], [L, T + ph]]), ...base, stroke: 'muted', dash: DASH.dotted });

  out.push(label(formatTick(x.min), L, GRAPH_H - 16, GRAPH_W, GRAPH_H, 'muted', 'start'));
  out.push(label(formatTick(x.max), L + pw, GRAPH_H - 16, GRAPH_W, GRAPH_H, 'muted', 'end'));
  out.push(label(formatTick(y.min), L - 4, T + ph, GRAPH_W, GRAPH_H, 'muted', 'end'));
  out.push(label(formatTick(y.max), L - 4, T + 10, GRAPH_W, GRAPH_H, 'muted', 'end'));
  if (x.label) out.push(label(x.label, L + pw / 2, GRAPH_H - 4, GRAPH_W, GRAPH_H, 'ink', 'middle'));
  if (y.label) out.push(label(y.label, 4, T + 2, GRAPH_W, GRAPH_H, 'ink', 'start'));

  const cycle: DiagramColor[] = ['accent', 'danger', 'success', 'muted'];
  spec.series.forEach((s, i) => {
    const color = s.color ?? cycle[i % cycle.length];
    const dash = DASH[s.stroke ?? 'solid'];
    const mapped = s.points.map(([vx, vy]): Pt => [px(vx), py(vy)]);
    out.push({ tag: 'polyline', points: pts(mapped), stroke: color, fill: 'none', dash });
    if (s.markers) for (const [mx, my] of mapped) out.push({ tag: 'circle', cx: mx, cy: my, r: 2.5, stroke: color, fill: color as DiagramFill, dash: null });
    if (s.label) {
      const [lx, ly] = mapped[mapped.length - 1];
      out.push(label(s.label, lx - 4, ly - 6, GRAPH_W, GRAPH_H, color, 'end'));
    }
  });
  return { width: GRAPH_W, height: GRAPH_H, alt: spec.alt, primitives: out };
}

/** Pure layout of a *validated* spec into SVG primitives (numbers and tokens only). */
export function layoutDiagram(spec: DiagramSpec): DiagramLayout {
  return spec.kind === 'geometry' ? geometryLayout(spec) : graphLayout(spec);
}

// ---------------------------------------------------------------- standalone SVG string (tests, static export)

export const DIAGRAM_PALETTE: Record<DiagramColor, string> = {
  ink: '#1f2937',
  muted: '#6b7280',
  accent: '#4f46e5',
  success: '#15803d',
  danger: '#b91c1c',
};

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function paintAttrs(p: Paint): string {
  const fill = p.fill === 'none' ? 'none' : DIAGRAM_PALETTE[p.fill === 'muted' ? 'muted' : (p.fill as DiagramColor)];
  const opacity = p.fill === 'none' ? '' : ' fill-opacity="0.18"';
  const dash = p.dash ? ` stroke-dasharray="${p.dash}"` : '';
  return `stroke="${DIAGRAM_PALETTE[p.stroke]}" stroke-width="1.6" fill="${fill}"${opacity}${dash}`;
}

/** Renders a layout to a self-contained SVG string. All text is XML-escaped; attributes come from numbers and a fixed palette. */
export function layoutToSvg(layout: DiagramLayout): string {
  const body = layout.primitives
    .map((p) => {
      switch (p.tag) {
        case 'line': return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" ${paintAttrs(p)}/>`;
        case 'polyline': return `<polyline points="${p.points}" ${paintAttrs(p)}/>`;
        case 'polygon': return `<polygon points="${p.points}" ${paintAttrs(p)}/>`;
        case 'circle': return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" ${paintAttrs(p)}/>`;
        case 'text': return `<text x="${p.x}" y="${p.y}" text-anchor="${p.anchor}" font-size="12" fill="${DIAGRAM_PALETTE[p.color]}">${escapeXml(p.text)}</text>`;
      }
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" role="img"><title>${escapeXml(layout.alt)}</title>${body}</svg>`;
}

export function diagramToSvg(spec: DiagramSpec): string {
  return layoutToSvg(layoutDiagram(spec));
}
