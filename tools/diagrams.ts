// The README diagrams: five SVG figures for "How it works", drawn from the 64-bit physics library.
// Pure: each function returns its SVG text and every number it prints, all computed here at
// generation time, so tests/unit/diagrams.test.ts can compare them with the library.
// tools/render-diagrams.ts checks the rules (diagramProblems) and writes the files.
import { GOLDEN_SCENES } from '../src/cpu-renderer/scenes.ts';
import {
  cameraFrame,
  circularOrbitEmitter,
  criticalImpactParameter,
  DEFAULT_DISK,
  deflectionAngleElliptic,
  f64,
  firstPlaneCrossingAngle,
  horizonRadius,
  integrateBinet,
  iscoRadius,
  localDirectionToEuclidean,
  photonSphereRadius,
  pixelDirection,
  redshiftFactor,
  shadowAngularRadius,
  staticObserverFactor,
  subringOffset,
  traceRay,
  weakFieldDeflection,
  type PlaneCrossingSample,
  type Termination,
} from '../src/physics/index.ts';
import { initialOrbit, viewCamera } from '../src/ui/orbit.ts';
import { OVERLAY_STYLES } from '../src/ui/overlay-style.ts';
import { decadeLabel } from '../src/ui/strip-overlay.ts';

const M = 1;
const W = 960;
const H = 540;
const DEG = Math.PI / 180;
/** Top of the caption band along the bottom of every diagram. */
const BAND = 506;

/** Git keeps every version of every image, so each file is capped. */
export const MAX_BYTES = 30_000;
export const VIEW_BOX = `0 0 ${W} ${H}`;
export const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
/** On every diagram drawn in r and phi (section 4.2 of the Stage 7 README design). */
export const FOOTNOTE =
  'Drawn in r and phi as flat polar coordinates; lengths and angles on the page are not what a ' +
  'local observer measures.';

/** Okabe-Ito colours with the page's meanings (src/ui/overlay-style.ts), on an opaque background. */
export const COLOURS = {
  background: '#101217',
  text: '#e8e6e3',
  muted: '#b3b0ab',
  rule: '#2c3038',
  edge: OVERLAY_STYLES.edge.colour,
  horizon: OVERLAY_STYLES.horizon.colour,
  photon: OVERLAY_STYLES.photon.colour,
  isco: OVERLAY_STYLES.isco.colour,
  orange: '#e69f00',
  vermillion: '#d55e00',
  grey: '#c9cdd3',
  disk: '#f3d9a4',
  diskFill: '#2a2620',
  diskImage: '#262a33',
  shadow: '#000000',
} as const;

/** A number printed on a diagram: its value and the exact text that appears in the SVG. */
export interface PrintedNumber {
  readonly value: number;
  readonly text: string;
}

export interface Diagram {
  readonly svg: string;
  readonly numbers: Readonly<Record<string, PrintedNumber>>;
  /** Values the drawing depends on but does not print, for the tests. */
  readonly checks?: Readonly<Record<string, number>>;
}

type Point = readonly [number, number];

interface Stroke {
  readonly colour: string;
  readonly width: number;
  readonly dash?: readonly number[];
}

const STYLES = {
  horizon: { colour: COLOURS.horizon, width: 1.5, dash: OVERLAY_STYLES.horizon.dash },
  photon: { colour: COLOURS.photon, width: 1.5, dash: OVERLAY_STYLES.photon.dash },
  isco: { colour: COLOURS.isco, width: 1.5, dash: OVERLAY_STYLES.isco.dash },
  edge: { colour: COLOURS.edge, width: 2 },
  captured: { colour: COLOURS.orange, width: 1.5, dash: [5, 3] },
  escaped: { colour: COLOURS.grey, width: 1.5 },
  axis: { colour: COLOURS.muted, width: 1, dash: [2, 4] },
  thin: { colour: COLOURS.muted, width: 1 },
  leader: { colour: COLOURS.muted, width: 1, dash: [2, 3] },
} satisfies Record<string, Stroke>;

// ---------------------------------------------------------------------------------------------
// Formatting and SVG primitives

/** A coordinate rounded to 0.1 px, never written as -0. */
const c = (x: number): string => {
  const v = Math.round(x * 10) / 10;
  return Object.is(v, -0) ? '0' : String(v);
};

/** toFixed with a minus sign (U+2212) for negative values. */
const fixed = (x: number, digits: number): string => x.toFixed(digits).replace('-', '−');

const printed = (value: number, digits: number): PrintedNumber => ({
  value,
  text: fixed(value, digits),
});

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Label text with subscripts written as _{...}: each becomes a smaller tspan lowered by dy, and
 * the text after it is raised back (Firefox does not support baseline-shift).
 */
function rich(label: string, size: number): string {
  const subSize = Math.round(size * 0.75);
  const shift = Math.round(size * 0.27);
  let out = '';
  let lowered = false;
  for (const part of label.split(/(_\{[^}]*\})/)) {
    if (part === '') continue;
    if (part.startsWith('_{')) {
      out += `<tspan dy="${shift}" font-size="${subSize}">${escapeXml(part.slice(2, -1))}</tspan>`;
      lowered = true;
    } else if (lowered) {
      out += `<tspan dy="-${shift}">${escapeXml(part)}</tspan>`;
      lowered = false;
    } else {
      out += escapeXml(part);
    }
  }
  return out;
}

const strokeOf = (s: Stroke): string =>
  `stroke="${s.colour}" stroke-width="${s.width}"` +
  (s.dash && s.dash.length > 0 ? ` stroke-dasharray="${s.dash.join(' ')}"` : '');

const line = (x1: number, y1: number, x2: number, y2: number, s: Stroke): string =>
  `<line x1="${c(x1)}" y1="${c(y1)}" x2="${c(x2)}" y2="${c(y2)}" ${strokeOf(s)}/>`;

const circle = (cx: number, cy: number, r: number, s: Stroke | null, fill = 'none'): string =>
  `<circle cx="${c(cx)}" cy="${c(cy)}" r="${c(r)}" fill="${fill}"${s ? ` ${strokeOf(s)}` : ''}/>`;

const path = (d: string, s: Stroke | null, fill = 'none', extra = ''): string =>
  `<path d="${d}" fill="${fill}"${s ? ` ${strokeOf(s)} stroke-linejoin="round"` : ''}${extra}/>`;

const rect = (x: number, y: number, w: number, h: number, fill: string, s?: Stroke): string =>
  `<rect x="${c(x)}" y="${c(y)}" width="${c(w)}" height="${c(h)}" fill="${fill}"` +
  `${s ? ` ${strokeOf(s)}` : ''}/>`;

interface TextStyle {
  readonly size?: number;
  readonly fill?: string;
  readonly anchor?: 'start' | 'middle' | 'end';
  /** Colour of a stroke drawn under the glyphs, so lines behind the label do not cut it. */
  readonly halo?: string;
}

function text(x: number, y: number, label: string, t: TextStyle = {}): string {
  const size = t.size ?? 15;
  const attrs = [`x="${c(x)}"`, `y="${c(y)}"`];
  if (size !== 15) attrs.push(`font-size="${size}"`);
  attrs.push(`fill="${t.fill ?? COLOURS.text}"`);
  if (t.anchor && t.anchor !== 'start') attrs.push(`text-anchor="${t.anchor}"`);
  if (t.halo) {
    attrs.push(`stroke="${t.halo}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"`);
  }
  return `<text ${attrs.join(' ')}>${rich(label, size)}</text>`;
}

/** A line sample and its text, for a legend row. */
function legendRow(x: number, y: number, s: Stroke, label: string, size = 14): string[] {
  return [line(x, y - 5, x + 30, y - 5, s), text(x + 38, y, label, { size, fill: s.colour })];
}

/** Open arrowhead at (x, y) pointing along angle a (radians, page coordinates). */
function arrowHead(x: number, y: number, a: number, s: Stroke, size = 7): string {
  const p = (da: number): string =>
    `${c(x - size * Math.cos(a + da))} ${c(y - size * Math.sin(a + da))}`;
  return path(`M${p(0.45)}L${c(x)} ${c(y)}L${p(-0.45)}`, { colour: s.colour, width: s.width });
}

/** Circular arc around (cx, cy) from page angle a0 to a1 (radians, y down), the short way. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const sweep = a1 > a0 ? 1 : 0;
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return (
    `M${c(cx + r * Math.cos(a0))} ${c(cy + r * Math.sin(a0))}` +
    `A${c(r)} ${c(r)} 0 ${large} ${sweep} ${c(cx + r * Math.cos(a1))} ${c(cy + r * Math.sin(a1))}`
  );
}

/** Ring between two circles around (cx, cy), for an even-odd fill. */
function ringPath(cx: number, cy: number, inner: number, outer: number): string {
  const loop = (r: number) =>
    `M${c(cx + r)} ${c(cy)}A${c(r)} ${c(r)} 0 1 0 ${c(cx - r)} ${c(cy)}` +
    `A${c(r)} ${c(r)} 0 1 0 ${c(cx + r)} ${c(cy)}Z`;
  return loop(outer) + loop(inner);
}

function svgDocument(title: string, desc: string, body: readonly string[]): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" width="${W}" height="${H}" ` +
      'role="img" aria-labelledby="title desc">',
    `<title id="title">${escapeXml(title)}</title>`,
    `<desc id="desc">${escapeXml(desc)}</desc>`,
    `<rect width="${W}" height="${H}" fill="${COLOURS.background}"/>`,
    `<g font-family="${FONT_STACK}" font-size="15">`,
    ...body,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}

/** The caption band: opaque, so curves leaving the drawing end cleanly above it. */
function band(left: string, right?: string): string[] {
  const out = [
    rect(0, BAND, W, H - BAND, COLOURS.background),
    line(0, BAND + 0.5, W, BAND + 0.5, { colour: COLOURS.rule, width: 1 }),
    text(16, 527, left, { size: 13, fill: COLOURS.muted }),
  ];
  if (right) out.push(text(W - 16, 527, right, { size: 13, fill: COLOURS.muted, anchor: 'end' }));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Polylines: clipping to a rectangle, simplification, path data

interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Liang-Barsky clipping of one segment; null when it misses the box. */
function clipSegment(a: Point, b: Point, box: Box): [Point, Point, number, number] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a[0] - box.x0],
    [dx, box.x1 - a[0]],
    [-dy, a[1] - box.y0],
    [dy, box.y1 - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy], t0, t1];
}

/** The parts of a polyline inside the box, each a polyline of its own. */
function clipPolyline(points: readonly Point[], box: Box): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  const flush = () => {
    if (run.length > 1) runs.push(run);
    run = [];
  };
  for (let i = 1; i < points.length; i++) {
    const seg = clipSegment(points[i - 1]!, points[i]!, box);
    if (!seg) {
      flush();
      continue;
    }
    const [p, q, t0, t1] = seg;
    if (t0 > 0 || run.length === 0) {
      flush();
      run = [p];
    }
    run.push(q);
    if (t1 < 1) flush();
  }
  flush();
  return runs;
}

/** Ramer-Douglas-Peucker simplification: no dropped point is farther than tol from the result. */
function simplify(points: readonly Point[], tol: number): Point[] {
  if (points.length < 3) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = points[a]!;
    const [bx, by] = points[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let worst = -1;
    let dmax = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]!;
      const d =
        len > 0 ? Math.abs(dy * (px - ax) - dx * (py - ay)) / len : Math.hypot(px - ax, py - ay);
      if (d > dmax) {
        dmax = d;
        worst = i;
      }
    }
    if (worst > 0 && dmax > tol) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Path data for polylines, with points repeated after rounding dropped. */
function pathData(runs: readonly (readonly Point[])[], close = false): string {
  let d = '';
  for (const run of runs) {
    const pts: string[] = [];
    for (const [x, y] of run) {
      const p = `${c(x)} ${c(y)}`;
      if (pts[pts.length - 1] !== p) pts.push(p);
    }
    if (pts.length < 2) continue;
    d += `M${pts[0]}L${pts.slice(1).join(' ')}${close ? 'Z' : ''}`;
  }
  return d;
}

/** Clip, simplify at 0.25 px and write as path data. */
function curve(points: readonly Point[], box: Box): string {
  return pathData(clipPolyline(points, box).map((run) => simplify(run, 0.25)));
}

// ---------------------------------------------------------------------------------------------
// Planar rays from the orbit equation u'' + u = 3 M u^2 (integrateBinet, as the renderers use)

interface PolarPoint {
  readonly r: number;
  readonly phi: number;
}

interface PlanarPath {
  readonly points: PolarPoint[];
  readonly termination: Termination;
  readonly crossings: readonly PlaneCrossingSample[];
}

/** Step in the orbital angle for drawn paths: smooth after simplification. */
const PATH_DPHI = 0.002;

/**
 * Polar path of a ray from u0 = 1/r0 with w0 = du/dphi, sampled every PATH_DPHI until it reaches
 * the horizon, escapes, or has swept phiMax. A ray from infinity starts at u0 = 0, w0 = 1/b.
 */
function planarPath(
  u0: number,
  w0: number,
  opts: { readonly phiMax?: number; readonly firstCrossing?: number } = {},
): PlanarPath {
  const points: PolarPoint[] = [];
  let step = 0;
  const res = integrateBinet(M, u0, w0, {
    round: f64,
    dphi: PATH_DPHI,
    maxSteps: Math.min(40_000, Math.ceil((opts.phiMax ?? 80) / PATH_DPHI)),
    uCapture: 1 / horizonRadius(M),
    ...(opts.firstCrossing === undefined ? {} : { firstCrossing: opts.firstCrossing }),
    onStep: (state) => {
      const u = state[0]!;
      if (u > 0) points.push({ r: 1 / u, phi: step * PATH_DPHI });
      step++;
    },
  });
  if (res.uEnd > 0) points.push({ r: 1 / res.uEnd, phi: res.phiEnd });
  return { points, termination: res.termination, crossings: res.crossings };
}

/** du/dphi of an inward ray leaving a static observer at u0 at angle alpha from the hole. */
const inwardSlope = (u0: number, alpha: number): number =>
  u0 * Math.sqrt(1 - 2 * M * u0) * (Math.cos(alpha) / Math.sin(alpha));

// ---------------------------------------------------------------------------------------------
// D0: key radii to scale

export function keyRadii(): Diagram {
  const rH = horizonRadius(M);
  const rP = photonSphereRadius(M);
  const rI = iscoRadius(M);
  const rOut = DEFAULT_DISK.rOut;
  const bc = criticalImpactParameter(M);
  const numbers = {
    horizon: printed(rH, 0),
    photonSphere: printed(rP, 0),
    isco: printed(rI, 0),
    diskOuter: printed(rOut, 0),
    bc: printed(bc, 3),
  };

  // Left: the whole disk at 10 px per M. Right: one quarter of the middle at 60 px per M.
  const sL = 10;
  const [lx, ly] = [245, 268];
  const sR = 60;
  const [ox, oy] = [550, 465];
  const extent = 6.5;
  const zoom = sR / sL;
  const body: string[] = [];

  body.push(text(lx - 200, 40, 'The disk, to scale (seen from above)', { size: 15 }));
  body.push(
    path(ringPath(lx, ly, rI * sL, rOut * sL), null, COLOURS.diskFill, ' fill-rule="evenodd"'),
  );
  body.push(circle(lx, ly, rOut * sL, { colour: COLOURS.disk, width: 1.5 }));
  body.push(circle(lx, ly, rI * sL, STYLES.isco));
  body.push(circle(lx, ly, rP * sL, STYLES.photon));
  body.push(circle(lx, ly, rH * sL, STYLES.horizon, COLOURS.shadow));
  body.push(
    text(lx, ly + 122, 'toy disk, from the ISCO', {
      size: 14,
      fill: COLOURS.disk,
      anchor: 'middle',
    }),
    text(lx, ly + 141, `(${numbers.isco.text} M) out to ${numbers.diskOuter.text} M`, {
      size: 14,
      fill: COLOURS.disk,
      anchor: 'middle',
    }),
  );
  // The magnified quarter, and lines to the panel that shows it.
  const q = extent * sL;
  body.push(rect(lx, ly - q, q, q, 'none', STYLES.thin));
  body.push(line(lx + q, ly - q, ox, oy - extent * sR, STYLES.leader));
  body.push(line(lx + q, ly, ox, oy, STYLES.leader));
  body.push(line(lx - 100, 494, lx - 50, 494, { colour: COLOURS.text, width: 2 }));
  body.push(text(lx - 44, 499, '5 M', { size: 13, fill: COLOURS.muted }));

  // Right panel.
  const R = (r: number) => r * sR;
  const top = oy - extent * sR;
  const right = ox + extent * sR;
  body.push(
    text(ox, 40, `The middle, magnified ${zoom} times (one quarter)`, { size: 15 }),
    path(
      `M${c(ox + R(rI))} ${c(oy)}L${c(right)} ${c(oy)}L${c(right)} ${c(top)}L${c(ox)} ${c(top)}` +
        `L${c(ox)} ${c(oy - R(rI))}A${c(R(rI))} ${c(R(rI))} 0 0 1 ${c(ox + R(rI))} ${c(oy)}Z`,
      null,
      COLOURS.diskFill,
    ),
  );
  const quarter = (r: number, s: Stroke, fill = 'none') =>
    path(
      `M${c(ox)} ${c(oy - R(r))}A${c(R(r))} ${c(R(r))} 0 0 1 ${c(ox + R(r))} ${c(oy)}` +
        (fill === 'none' ? '' : `L${c(ox)} ${c(oy)}Z`),
      s,
      fill,
    );
  body.push(quarter(rH, STYLES.horizon, COLOURS.shadow));
  body.push(quarter(rP, STYLES.photon));
  body.push(quarter(bc, { colour: COLOURS.edge, width: 1.5 }));
  body.push(quarter(rI, STYLES.isco));
  body.push(line(ox, oy, right, oy, STYLES.thin), line(ox, oy, ox, top, STYLES.thin));
  for (let k = 1; k <= 6; k++) {
    body.push(line(ox + k * sR, oy, ox + k * sR, oy + 5, STYLES.thin));
    body.push(
      text(ox + k * sR, oy + 19, `${k} M`, { size: 13, fill: COLOURS.muted, anchor: 'middle' }),
    );
  }
  body.push(text(ox - 6, oy + 19, '0', { size: 13, fill: COLOURS.muted, anchor: 'middle' }));
  // Names in the gaps, just outside each circle near the vertical axis.
  const gapLabel = (r: number, label: string, fill: string) =>
    text(ox + 7, oy - R(r) - 7, label, { size: 14, fill });
  body.push(gapLabel(rH, `horizon, ${numbers.horizon.text} M`, COLOURS.horizon));
  body.push(gapLabel(rP, `photon sphere, ${numbers.photonSphere.text} M`, COLOURS.photon));
  body.push(gapLabel(bc, `b_{c} ≈ ${numbers.bc.text} M`, COLOURS.edge));
  body.push(gapLabel(rI, `ISCO, ${numbers.isco.text} M: the disk's inner edge`, COLOURS.isco));
  // Where the ISCO arc leaves the most room at the panel's top right.
  const note: TextStyle = { size: 13, fill: COLOURS.muted, anchor: 'end' };
  body.push(
    text(right - 6, top + 56, 'b_{c} = 3√3 M is not a place:', note),
    text(right - 6, top + 73, 'rays from far away aimed', note),
    text(right - 6, top + 90, 'closer than b_{c} fall in', note),
  );
  body.push(...band(FOOTNOTE, `left 1 M = ${sL} px, right 1 M = ${sR} px`));

  return {
    svg: svgDocument(
      'Key radii of a non-rotating black hole, to scale',
      `Top view of the disk plane. The event horizon at ${numbers.horizon.text} M, the photon ` +
        `sphere at ${numbers.photonSphere.text} M, the innermost stable circular orbit (ISCO) at ` +
        `${numbers.isco.text} M where the toy disk begins, the disk's outer edge at ` +
        `${numbers.diskOuter.text} M, and the critical impact parameter b_c = 3 sqrt(3) M, about ` +
        `${numbers.bc.text} M.`,
      body,
    ),
    numbers,
  };
}

// ---------------------------------------------------------------------------------------------
// D1: light paths

/** Impact parameters of the drawn rays, in units of b_c. */
export const LIGHT_PATH_RATIOS = [0.4, 0.75, 0.95, 1, 1.002, 1.03, 1.15, 1.4, 1.7] as const;

export function lightPaths(): Diagram {
  const s = 26;
  const [cx, cy] = [580, 270];
  const bc = criticalImpactParameter(M);
  const toPage = (p: PolarPoint): Point => [
    cx - p.r * Math.cos(p.phi) * s,
    cy - p.r * Math.sin(p.phi) * s,
  ];
  const box: Box = { x0: -5, y0: -5, x1: W + 5, y1: BAND + 5 };
  const bWide = 1.7 * bc;
  const numbers = {
    bc: printed(bc, 3),
    deflectionWide: printed(deflectionAngleElliptic(bWide, M) / DEG, 1),
    weakFieldWide: printed(weakFieldDeflection(bWide, M, 1) / DEG, 1),
    scale: printed(s, 0),
  };

  const body: string[] = [line(0, cy, W, cy, STYLES.axis)];
  const rays = LIGHT_PATH_RATIOS.map((k) => {
    // The critical ray winds onto the photon sphere for ever; drawn for a sweep of 3.5 pi.
    const ray = planarPath(0, 1 / (k * bc), k === 1 ? { phiMax: 3.5 * Math.PI } : {});
    return { k, ray, d: curve(ray.points.map(toPage), box) };
  });
  for (const { k, ray, d } of rays) {
    if (k !== 1 && ray.termination === 'escaped') body.push(path(d, STYLES.escaped));
  }
  for (const { k, ray, d } of rays) {
    if (k !== 1 && ray.termination === 'captured') body.push(path(d, STYLES.captured));
  }
  body.push(path(rays.find((r) => r.k === 1)!.d, STYLES.edge));
  body.push(circle(cx, cy, photonSphereRadius(M) * s, STYLES.photon));
  body.push(circle(cx, cy, horizonRadius(M) * s, STYLES.horizon, COLOURS.shadow));

  // b_c as a measured arrow at the left.
  const ax = 62;
  const yTop = cy - bc * s;
  const arrow: Stroke = { colour: COLOURS.text, width: 1.2 };
  body.push(line(ax, cy, ax, yTop, arrow));
  body.push(arrowHead(ax, yTop, -Math.PI / 2, arrow), arrowHead(ax, cy, Math.PI / 2, arrow));
  body.push(
    text(ax + 10, cy - (bc * s) / 2 + 6, `b_{c} = 3√3 M ≈ ${numbers.bc.text} M`, {
      halo: COLOURS.background,
    }),
  );

  // Ray labels at the left, in units of b_c: below the captured rays, above the others, and one
  // label for the three rays too close together to tell apart there.
  const small: TextStyle = { size: 13, fill: COLOURS.muted, halo: COLOURS.background };
  const yOf = (k: number) => cy - k * bc * s;
  for (const k of [0.4, 0.75, 0.95]) body.push(text(14, yOf(k) + 14, String(k), small));
  body.push(text(14, yOf(1.03) - 4, '1, 1.002, 1.03', small));
  for (const k of [1.15, 1.4]) body.push(text(14, yOf(k) - 4, String(k), small));
  body.push(text(14, yOf(1.7) - 4, 'b/b_{c} = 1.7', small));

  body.push(
    text(cx + 2.3 * s, cy + 3.2 * s, `event horizon, r = ${horizonRadius(M)}M`, {
      fill: COLOURS.horizon,
      halo: COLOURS.background,
    }),
    text(cx + 2.5 * s, cy - 3.3 * s, `photon sphere, r = ${photonSphereRadius(M)}M`, {
      fill: COLOURS.photon,
      halo: COLOURS.background,
    }),
    text(W - 16, 62, `b = 1.7 b_{c}: bent by ${numbers.deflectionWide.text}°`, {
      anchor: 'end',
      fill: COLOURS.grey,
      halo: COLOURS.background,
    }),
    text(W - 16, 81, `(weak-field estimate 4M/b: ${numbers.weakFieldWide.text}°)`, {
      size: 13,
      fill: COLOURS.muted,
      anchor: 'end',
      halo: COLOURS.background,
    }),
  );
  body.push(
    ...legendRow(16, 448, STYLES.captured, 'b < b_{c}: falls in'),
    ...legendRow(16, 470, STYLES.edge, 'b = b_{c}: circles the photon sphere (the shadow edge)'),
    ...legendRow(16, 492, STYLES.escaped, 'b > b_{c}: bent, escapes'),
  );
  body.push(...band(FOOTNOTE, `1 M = ${numbers.scale.text} px`));

  return {
    svg: svgDocument(
      'Light paths around a non-rotating black hole',
      'Rays arriving from the left with impact parameters from 0.4 to 1.7 times the critical ' +
        'value b_c. Rays below b_c fall through the photon sphere into the horizon; the ray at ' +
        'b_c circles the photon sphere; rays above it are bent and escape. The ray at 1.7 b_c is ' +
        `bent by ${numbers.deflectionWide.text} degrees, where the weak-field estimate gives ` +
        `${numbers.weakFieldWide.text}.`,
      body,
    ),
    numbers,
  };
}

// ---------------------------------------------------------------------------------------------
// D2: shadow size

/** Observer radius of the shadow-size diagram, in M. */
export const SHADOW_OBSERVER = 10;

export function shadowSize(): Diagram {
  const ro = SHADOW_OBSERVER;
  const psi = shadowAngularRadius(ro, M);
  const bc = criticalImpactParameter(M);
  // The same ray as drawn on flat paper in r and phi: the radial part shrinks by sqrt(1 - 2M/r).
  const v = localDirectionToEuclidean([ro, 0, 0], [-Math.cos(psi), Math.sin(psi), 0], M);
  const pageAngle = Math.atan2(v[1], -v[0]);
  const numbers = {
    observer: printed(ro, 0),
    psi: printed(psi / DEG, 2),
    straight: printed(Math.asin(bc / ro) / DEG, 2),
    page: printed(pageAngle / DEG, 2),
  };

  // Left panel: the observer at 10 M, 30 px per M.
  const s = 30;
  const ox = 40;
  const cy = 262;
  const cx = ox + ro * s;
  const toPage = (p: PolarPoint): Point => [
    cx - p.r * Math.cos(p.phi) * s,
    cy - p.r * Math.sin(p.phi) * s,
  ];
  const box: Box = { x0: -5, y0: -5, x1: 575, y1: BAND + 5 };
  const u0 = 1 / ro;
  const offset = 2 * DEG;
  const body: string[] = [line(ox, cy, cx, cy, STYLES.axis)];
  const edgeRay = planarPath(u0, inwardSlope(u0, psi), { phiMax: 2.6 * Math.PI });
  const inner = planarPath(u0, inwardSlope(u0, psi - offset));
  const outer = planarPath(u0, inwardSlope(u0, psi + offset));
  body.push(path(curve(outer.points.map(toPage), box), STYLES.escaped));
  body.push(path(curve(inner.points.map(toPage), box), STYLES.captured));
  body.push(path(curve(edgeRay.points.map(toPage), box), STYLES.edge));
  body.push(circle(cx, cy, photonSphereRadius(M) * s, STYLES.photon));
  body.push(circle(cx, cy, horizonRadius(M) * s, STYLES.horizon, COLOURS.shadow));
  body.push(path(arc(ox, cy, 44, 0, -pageAngle), STYLES.thin));
  body.push(circle(ox, cy, 4, null, COLOURS.text));
  body.push(
    text(ox - 6, cy + 26, `observer, r_{o} = ${numbers.observer.text} M`),
    text(ox - 6, cy + 46, `angle drawn here: ${numbers.page.text}°, not ψ_{sh}`, {
      size: 13,
      fill: COLOURS.muted,
    }),
  );
  const step = `${offset / DEG}°`;
  body.push(
    ...legendRow(
      16,
      448,
      STYLES.edge,
      `ψ = ψ_{sh}: the edge ray, winds onto r = ${photonSphereRadius(M)}M`,
    ),
    ...legendRow(16, 470, STYLES.captured, `ψ_{sh} − ${step}: falls in`),
    ...legendRow(16, 492, STYLES.escaped, `ψ_{sh} + ${step}: escapes`),
  );
  body.push(line(588, 24, 588, BAND - 16, { colour: COLOURS.rule, width: 1 }));

  // Right panel: the photon's momentum in the observer's own frame, drawn true to angle.
  const tx = 612;
  const ty = 336;
  const hyp = 296;
  const px = tx + hyp * Math.cos(psi);
  const py = ty - hyp * Math.sin(psi);
  body.push(
    text(tx - 8, 52, "In the observer's own frame"),
    text(tx - 8, 72, '(angles in this panel are true)', { size: 13, fill: COLOURS.muted }),
    text(tx - 8, 104, 'sin ψ = (L/r_{o}) / (E/√(1 − 2M/r_{o}))'),
    text(tx + 26, 128, '= (b/r_{o}) √(1 − 2M/r_{o})'),
  );
  body.push(line(px, ty, W - 16, ty, STYLES.axis));
  body.push(line(tx, ty, px, ty, { colour: COLOURS.text, width: 1.5 }));
  body.push(line(px, ty, px, py, { colour: COLOURS.text, width: 1.5 }));
  body.push(line(tx, ty, px, py, { colour: COLOURS.edge, width: 2.5 }));
  body.push(
    path(`M${c(px - 10)} ${c(ty)}L${c(px - 10)} ${c(ty - 10)}L${c(px)} ${c(ty - 10)}`, STYLES.thin),
  );
  body.push(path(arc(tx, ty, 58, 0, -psi), STYLES.thin));
  body.push(
    text(tx + 66, ty - 10, 'ψ_{sh}'),
    text(px + 10, (ty + py) / 2 + 5, 'L / r_{o}'),
    text(tx + 132, ty - 92, 'E / √(1 − 2M/r_{o})', { fill: COLOURS.edge, anchor: 'end' }),
    text(tx, ty + 22, 'towards the hole (local radial direction)', {
      size: 13,
      fill: COLOURS.muted,
    }),
    text(
      tx - 8,
      410,
      `Edge, b = b_{c}: ψ_{sh} = ${numbers.psi.text}° at r_{o} = ${numbers.observer.text} M`,
    ),
    text(
      tx - 8,
      434,
      `Straight lines (sin ψ = b_{c}/r_{o}) would give ${numbers.straight.text}°.`,
      {
        size: 13,
        fill: COLOURS.muted,
      },
    ),
  );
  body.push(...band(FOOTNOTE, `left 1 M = ${s} px`));

  return {
    svg: svgDocument(
      'Why the shadow has the size it has',
      `Left: from an observer at ${numbers.observer.text} M, the ray at the shadow edge winds onto ` +
        `the photon sphere; rays ${offset / DEG} degrees inside fall in and ${offset / DEG} ` +
        'degrees outside escape. Right: the ' +
        "photon's momentum in the observer's own frame, where sin psi = (b/r_o) sqrt(1 - 2M/r_o); " +
        `at the edge psi_sh = ${numbers.psi.text} degrees, against ${numbers.straight.text} for ` +
        'straight lines.',
      body,
    ),
    numbers,
  };
}

// ---------------------------------------------------------------------------------------------
// D3: ring images

/** Distance of the "far away" observer of the ring-image diagram, in M. */
export const RING_OBSERVER = 1e4;

const ORDER_STYLES: readonly Stroke[] = [
  { colour: COLOURS.grey, width: 2 },
  { colour: COLOURS.orange, width: 2, dash: [8, 4] },
  { colour: COLOURS.vermillion, width: 2, dash: [3, 3] },
  { colour: COLOURS.text, width: 2, dash: [1, 3] },
];

export function ringImages(): Diagram {
  const ro = RING_OBSERVER;
  const R = iscoRadius(M);
  const bc = criticalImpactParameter(M);
  // Face-on: the observer sits on the disk's axis, so every ray plane meets the disk at pi/2.
  const phi0 = firstPlaneCrossingAngle(1, 0)!;
  const eps = [0, 1, 2, 3].map((n) => subringOffset(ro, R, n, phi0, M));
  const ratio = (n: number) => eps[n]! / eps[n + 1]!;
  const k = Math.sqrt(1 - (2 * M) / ro) / ro;
  const u0 = 1 / ro;

  // Side view: observer far up the page, disk edge-on along the middle, 24 px per M.
  const s = 24;
  const [cx, cy] = [285, 282];
  const toPage = (p: PolarPoint): Point => [
    cx + p.r * Math.sin(p.phi) * s,
    cy - p.r * Math.cos(p.phi) * s,
  ];
  const box: Box = { x0: -5, y0: 52, x1: 580, y1: BAND + 5 };
  const paths = [0, 1, 2].map((n) => {
    const sinA = k * bc * (1 + eps[n]!);
    const alpha = Math.asin(sinA);
    const target = phi0 + n * Math.PI;
    const ray = planarPath(u0, inwardSlope(u0, alpha), {
      phiMax: target + PATH_DPHI,
      firstCrossing: phi0,
    });
    const end = ray.crossings[n];
    if (!end) throw new Error(`order ${n} ray did not reach its crossing`);
    const points = ray.points.filter((p) => p.phi < target).map(toPage);
    const endPoint = toPage({ r: 1 / end.u, phi: end.phi });
    points.push(endPoint);
    const earlier = ray.crossings.slice(0, n).map((x) => ({
      r: 1 / x.u,
      at: toPage({ r: 1 / x.u, phi: x.phi }),
    }));
    return { n, points, endPoint, endRadius: 1 / end.u, earlier };
  });
  const crossingRadii = paths.flatMap((p) => p.earlier.map((e) => e.r));

  const numbers = {
    observer: { value: ro, text: decadeLabel(Math.round(Math.log10(ro))) },
    ratio01: printed(ratio(0), 2),
    ratio12: printed(ratio(1), 2),
    ratio23: printed(ratio(2), 2),
    ePi: printed(Math.exp(Math.PI), 2),
    gap1: { value: eps[1]! * bc, text: (eps[1]! * bc).toPrecision(2) },
    gap2: { value: eps[2]! * bc, text: (eps[2]! * bc).toPrecision(2) },
    cross1: printed(crossingRadii[0]!, 2),
    cross2a: printed(crossingRadii[1]!, 2),
    cross2b: printed(crossingRadii[2]!, 2),
  };
  const checks = Object.fromEntries(paths.map((p) => [`end${p.n}`, p.endRadius]));

  const body: string[] = [
    text(
      16,
      36,
      `Side view: observer far above (r_{o} = ${numbers.observer.text} M), looking down`,
    ),
  ];
  const diskStroke: Stroke = { colour: COLOURS.disk, width: 4 };
  body.push(line(0, cy, cx - R * s, cy, diskStroke), line(cx + R * s, cy, 580, cy, diskStroke));
  body.push(circle(cx, cy, photonSphereRadius(M) * s, STYLES.photon));
  body.push(circle(cx, cy, horizonRadius(M) * s, STYLES.horizon, COLOURS.shadow));
  for (const p of [...paths].reverse()) {
    body.push(path(curve(p.points, box), ORDER_STYLES[p.n]!));
  }
  for (const p of paths) {
    for (const e of p.earlier) {
      body.push(
        circle(
          e.at[0],
          e.at[1],
          4,
          { colour: ORDER_STYLES[p.n]!.colour, width: 1.5 },
          COLOURS.background,
        ),
      );
    }
  }
  body.push(
    circle(cx - R * s, cy, 5, null, COLOURS.isco),
    circle(cx + R * s, cy, 5, null, COLOURS.isco),
  );
  body.push(text(16, cy - 12, 'disk, seen edge-on', { size: 14, fill: COLOURS.disk }));

  // Order labels where each path is on its own: n = 0 beside its straight part, n = 1 below its
  // lowest point, n = 2 above its loop over the hole.
  const p0 = paths[0]!.points.find((p) => p[1] > 120)!;
  body.push(
    text(p0[0] + 10, 124, 'n = 0', { fill: ORDER_STYLES[0]!.colour, halo: COLOURS.background }),
  );
  const low = paths[1]!.points.reduce((a, b) => (b[1] > a[1] ? b : a));
  body.push(
    text(low[0], low[1] + 22, 'n = 1', {
      fill: ORDER_STYLES[1]!.colour,
      anchor: 'middle',
      halo: COLOURS.background,
    }),
  );
  const loop = paths[2]!.points.filter(
    (p) => Math.abs(p[0] - cx) < 2 * s && p[1] < cy && p[1] > box.y0,
  );
  const high = loop.reduce((a, b) => (b[1] < a[1] ? b : a));
  body.push(
    text(high[0], high[1] - 10, 'n = 2', {
      fill: ORDER_STYLES[2]!.colour,
      anchor: 'middle',
      halo: COLOURS.background,
    }),
  );
  body.push(
    text(16, 448, `Filled dots: the disk's inner edge, r = ${R} M (ISCO). Open dots: earlier`, {
      size: 13,
      fill: COLOURS.muted,
    }),
    text(16, 467, `crossings of the disk plane, at r = ${numbers.cross1.text} M (n = 1),`, {
      size: 13,
      fill: COLOURS.muted,
    }),
    text(
      16,
      486,
      `${numbers.cross2a.text} M and ${numbers.cross2b.text} M (n = 2): inside ${R} M, where there is no disk.`,
      { size: 13, fill: COLOURS.muted },
    ),
  );
  body.push(line(588, 24, 588, BAND - 16, { colour: COLOURS.rule, width: 1 }));

  // Image plane: the circles to scale, then their distances from the edge on a log scale.
  const si = 14;
  const [ix, iy] = [700, 166];
  body.push(text(604, 36, 'What the observer sees (images of r = 6 M)'));
  body.push(circle(ix, iy, bc * si, null, COLOURS.shadow));
  for (const n of [0, 1, 2]) body.push(circle(ix, iy, bc * (1 + eps[n]!) * si, ORDER_STYLES[n]!));
  body.push(circle(ix, iy, bc * si, { colour: COLOURS.edge, width: 1.5 }));
  body.push(text(ix, iy + 5, 'shadow', { size: 13, fill: COLOURS.muted, anchor: 'middle' }));
  const lx = 818;
  for (const [i, n] of [0, 1, 2].entries()) {
    body.push(...legendRow(lx, 96 + 24 * i, ORDER_STYLES[n]!, `n = ${n}`));
  }
  body.push(...legendRow(lx, 168, { colour: COLOURS.edge, width: 1.5 }, 'edge, b_{c}'));
  body.push(
    text(604, 290, `To scale (1 M = ${si} px): n = 1 lies ${numbers.gap1.text} M outside the`, {
      size: 13,
      fill: COLOURS.muted,
    }),
    text(604, 308, `edge and n = 2 only ${numbers.gap2.text} M, so they merge with it here.`, {
      size: 13,
      fill: COLOURS.muted,
    }),
  );

  // The ladder: x falls with log10(b/b_c - 1), 70 px per decade.
  const ax0 = 614;
  const perDecade = 70;
  const ay = 392;
  const xOf = (e: number) => ax0 - perDecade * Math.log10(e);
  body.push(line(ax0 - 6, ay, 940, ay, STYLES.thin));
  for (let d = 0; d >= -4; d--) {
    const x = ax0 - perDecade * d;
    body.push(line(x, ay, x, ay + 6, STYLES.thin));
    body.push(
      text(x, ay + 22, decadeLabel(d), { size: 13, fill: COLOURS.muted, anchor: 'middle' }),
    );
  }
  eps.forEach((e, n) => {
    const st = ORDER_STYLES[n]!;
    body.push(circle(xOf(e), ay, 4.5, null, st.colour));
    body.push(text(xOf(e), ay - 12, `n = ${n}`, { size: 13, fill: st.colour, anchor: 'middle' }));
  });
  const ratioTexts = [numbers.ratio01.text, numbers.ratio12.text, numbers.ratio23.text];
  ratioTexts.forEach((t, n) => {
    const xa = xOf(eps[n]!);
    const xb = xOf(eps[n + 1]!);
    const yb = ay - 34;
    body.push(
      path(
        `M${c(xa + 2)} ${c(yb + 6)}L${c(xa + 2)} ${c(yb)}L${c(xb - 2)} ${c(yb)}L${c(xb - 2)} ${c(yb + 6)}`,
        STYLES.thin,
      ),
    );
    body.push(text((xa + xb) / 2, yb - 6, `÷ ${t}`, { size: 13, anchor: 'middle' }));
  });
  body.push(
    text(ax0 - 6, ay + 46, 'b/b_{c} − 1: distance from the shadow edge, logarithmic', {
      size: 13,
      fill: COLOURS.muted,
    }),
    text(
      ax0 - 6,
      ay + 68,
      `Each extra half-turn: about exp(π) = ${numbers.ePi.text} times closer.`,
      {
        size: 13,
        fill: COLOURS.text,
      },
    ),
  );
  body.push(...band(FOOTNOTE, `side view 1 M = ${s} px`));

  return {
    svg: svgDocument(
      'Ring images of the disk inner edge, and why they nest',
      'Left: side view of three rays from a distant observer above a face-on disk; they reach ' +
        'the inner edge r = 6 M after crossing the disk plane once, twice and three times (images ' +
        'n = 0, 1 and 2). Right: the image circles, and their distances from the shadow edge on a ' +
        `logarithmic scale, which shrink by ${numbers.ratio01.text}, ${numbers.ratio12.text} and ` +
        `${numbers.ratio23.text} from one image to the next; exp(pi) = ${numbers.ePi.text}.`,
      body,
    ),
    numbers,
    checks,
  };
}

// ---------------------------------------------------------------------------------------------
// D4: frequency shift across the disk

/** A grid point's two fields: the radius of its first disk-plane crossing, and g there. */
interface ShiftGrid {
  readonly nx: number;
  readonly ny: number;
  readonly step: number;
  /** First crossing radius; 2 (the horizon) for rays captured first, 1e3 for rays that escape. */
  readonly r0: Float64Array;
  /** g for the camera, where the first crossing lies outside the photon sphere; NaN otherwise. */
  readonly g: Float64Array;
}

/** A contour point on the grid edge between corners a and b, at fraction t from a. */
interface EdgePoint {
  readonly a: number;
  readonly b: number;
  readonly t: number;
}

/**
 * Marching squares at `level`, with the segments joined into polylines (closed loops end where
 * they start). Cells with an undefined corner are skipped; saddles are split by the cell mean.
 */
function contour(nx: number, ny: number, v: Float64Array, level: number): EdgePoint[][] {
  const segs: [number, number][] = [];
  const points = new Map<number, EdgePoint>();
  const at = (a: number, b: number): number => {
    const key = b === a + 1 ? 2 * a : 2 * a + 1;
    if (!points.has(key)) points.set(key, { a, b, t: (level - v[a]!) / (v[b]! - v[a]!) });
    return key;
  };
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const c0 = j * nx + i;
      const c1 = c0 + 1;
      const c2 = c1 + nx;
      const c3 = c0 + nx;
      const vals = [v[c0]!, v[c1]!, v[c2]!, v[c3]!];
      if (!vals.every(Number.isFinite)) continue;
      const code =
        (vals[0]! > level ? 1 : 0) |
        (vals[1]! > level ? 2 : 0) |
        (vals[2]! > level ? 4 : 0) |
        (vals[3]! > level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const top = () => at(c0, c1);
      const rightEdge = () => at(c1, c2);
      const bottom = () => at(c3, c2);
      const left = () => at(c0, c3);
      if (code === 5 || code === 10) {
        const centreAbove = (vals[0]! + vals[1]! + vals[2]! + vals[3]!) / 4 > level;
        if ((code === 5) === centreAbove) {
          segs.push([top(), rightEdge()], [bottom(), left()]);
        } else {
          segs.push([top(), left()], [rightEdge(), bottom()]);
        }
        continue;
      }
      const crossed: number[] = [];
      const above = (k: number) => (code >> k) & 1;
      if (above(0) !== above(1)) crossed.push(top());
      if (above(1) !== above(2)) crossed.push(rightEdge());
      if (above(3) !== above(2)) crossed.push(bottom());
      if (above(0) !== above(3)) crossed.push(left());
      segs.push([crossed[0]!, crossed[1]!]);
    }
  }

  const byKey = new Map<number, number[]>();
  segs.forEach(([p, q], i) => {
    for (const key of [p, q]) {
      const list = byKey.get(key);
      if (list) list.push(i);
      else byKey.set(key, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const chains: EdgePoint[][] = [];
  const walk = (first: number, fromKey: number) => {
    const keys = [fromKey];
    let seg = first;
    let key = fromKey;
    for (;;) {
      used[seg] = 1;
      const [p, q] = segs[seg]!;
      key = p === key ? q : p;
      keys.push(key);
      const next = byKey.get(key)!.find((i) => used[i] === 0);
      if (next === undefined) break;
      seg = next;
    }
    chains.push(keys.map((kk) => points.get(kk)!));
  };
  segs.forEach(([p, q], i) => {
    if (used[i] === 1) return;
    if (byKey.get(p)!.length === 1) walk(i, p);
    else if (byKey.get(q)!.length === 1) walk(i, q);
  });
  segs.forEach(([p], i) => {
    if (used[i] === 0) walk(i, p);
  });
  return chains;
}

/** The page's opening camera and the CPU renderer's step settings. */
function shiftGrid(step: number): ShiftGrid {
  const camera = viewCamera(initialOrbit);
  const frame = cameraFrame(camera, M);
  const gObserver = staticObserverFactor(camera.distance, M);
  const { dphi, maxSteps } = GOLDEN_SCENES.diskInclined;
  const nx = Math.round(W / step) + 1;
  const ny = Math.round(H / step) + 1;
  const r0 = new Float64Array(nx * ny);
  const g = new Float64Array(nx * ny).fill(NaN);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const d = pixelDirection(frame, W, H, i * step, j * step);
      const ray = traceRay(M, frame.position, d, { dphi, maxSteps });
      const first = ray.crossings[0];
      const p = j * nx + i;
      if (first) {
        r0[p] = first.radius;
        if (first.radius > photonSphereRadius(M) * (1 + 1e-9)) {
          g[p] = redshiftFactor(circularOrbitEmitter(first.radius, M), ray.lzOverE) * gObserver;
        }
      } else {
        r0[p] = ray.termination === 'captured' ? horizonRadius(M) : 1e3;
      }
    }
  }
  return { nx, ny, step, r0, g };
}

export function redshiftContours(): Diagram {
  const camera = viewCamera(initialOrbit);
  const { rIn, rOut } = DEFAULT_DISK;
  const grid = shiftGrid(2);
  const { nx, step } = grid;
  const pointOf = (e: EdgePoint): Point => {
    const ia = e.a % nx;
    const ja = Math.floor(e.a / nx);
    const ib = e.b % nx;
    const jb = Math.floor(e.b / nx);
    return [(ia + e.t * (ib - ia)) * step, (ja + e.t * (jb - ja)) * step];
  };
  const field = (f: Float64Array, e: EdgePoint) => f[e.a]! + e.t * (f[e.b]! - f[e.a]!);

  // g over the direct image only, and which side is brighter.
  let gMin = Infinity;
  let gMax = -Infinity;
  let leftSum = 0;
  let rightSum = 0;
  for (let p = 0; p < grid.r0.length; p++) {
    const r = grid.r0[p]!;
    const g = grid.g[p]!;
    if (!(r >= rIn && r <= rOut && Number.isFinite(g))) continue;
    gMin = Math.min(gMin, g);
    gMax = Math.max(gMax, g);
    if ((p % nx) * step < W / 2) leftSum += g - 1;
    else rightSum += g - 1;
  }
  const approachingLeft = leftSum > rightSum;

  // The disk's direct image: between the images of r = rIn and r = rOut.
  const outline: string[] = [];
  for (const level of [rIn, rOut]) {
    for (const chain of contour(grid.nx, grid.ny, grid.r0, level)) {
      const first = chain[0]!;
      const last = chain[chain.length - 1]!;
      if (first.a !== last.a || first.b !== last.b) {
        throw new Error(`the image of r = ${level} M is not a closed curve`);
      }
      outline.push(pathData([simplify(chain.map(pointOf), 0.3)], true));
    }
  }

  // Lines of constant g, cut where they leave the disk.
  const levels: number[] = [];
  for (let l = Math.ceil(gMin * 10) / 10; l < gMax; l = Math.round(l * 10 + 1) / 10) {
    if (l > gMin) levels.push(l);
  }
  interface Line {
    readonly level: number;
    readonly runs: { x: number; y: number; r: number }[][];
  }
  const lines: Line[] = levels.map((level) => {
    const runs: { x: number; y: number; r: number }[][] = [];
    for (const chain of contour(grid.nx, grid.ny, grid.g, level)) {
      let run: { x: number; y: number; r: number }[] = [];
      const pts = chain.map((e) => {
        const [x, y] = pointOf(e);
        return { x, y, r: field(grid.r0, e) };
      });
      const inside = (q: { r: number }) => q.r >= rIn && q.r <= rOut;
      const cut = (
        a: { x: number; y: number; r: number },
        b: { x: number; y: number; r: number },
      ) => {
        const edge = !inside(a) ? (a.r < rIn ? rIn : rOut) : b.r < rIn ? rIn : rOut;
        const t = (edge - a.r) / (b.r - a.r);
        return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), r: edge };
      };
      pts.forEach((q, i) => {
        const prev = pts[i - 1];
        if (inside(q)) {
          if (run.length === 0 && prev && !inside(prev)) run.push(cut(prev, q));
          run.push(q);
        } else if (run.length > 0 && prev) {
          run.push(cut(prev, q));
          if (run.length > 1) runs.push(run);
          run = [];
        }
      });
      if (run.length > 1) runs.push(run);
    }
    return { level, runs };
  });
  const lengthOf = (l: Line) =>
    l.runs.reduce(
      (sum, run) =>
        sum +
        run.slice(1).reduce((s2, q, i) => s2 + Math.hypot(q.x - run[i]!.x, q.y - run[i]!.y), 0),
      0,
    );
  const drawn = lines.filter((l) => lengthOf(l) >= 60);

  const styleOf = (level: number): Stroke =>
    Math.abs(level - 1) < 1e-9
      ? { colour: COLOURS.text, width: 2 }
      : level > 1
        ? { colour: COLOURS.edge, width: 1.5 }
        : { colour: COLOURS.orange, width: 1.5, dash: [5, 3] };

  const fixedNumbers = {
    distance: printed(camera.distance, 0),
    elevation: printed(camera.elevationDeg, 0),
    fov: printed(camera.fovYDeg, 0),
    gMin: printed(gMin, 3),
    gMax: printed(gMax, 3),
    brightness: printed((gMax / gMin) ** 4, 0),
  };
  const levelNumbers = new Map(drawn.map((l) => [l.level, printed(l.level, 1)]));

  const body: string[] = [];
  const shadowRadius =
    (Math.tan(shadowAngularRadius(camera.distance, M)) / Math.tan((camera.fovYDeg * DEG) / 2)) *
    (H / 2);
  body.push(circle(W / 2, H / 2, shadowRadius, null, COLOURS.shadow));
  body.push(
    path(
      outline.join(''),
      { colour: COLOURS.muted, width: 1 },
      COLOURS.diskImage,
      ' fill-rule="evenodd"',
    ),
  );
  for (const l of drawn) {
    const runs = l.runs.map((run) =>
      simplify(
        run.map((q) => [q.x, q.y] as const),
        0.3,
      ),
    );
    body.push(path(pathData(runs), styleOf(l.level), 'none', ' stroke-linecap="round"'));
  }

  // One label per line, near the middle of the disk (r = 12 M), kept apart from the others.
  const placed: Point[] = [];
  for (const l of drawn) {
    let best: { x: number; y: number; score: number } | null = null;
    for (const run of l.runs) {
      for (const q of run) {
        if (q.y < 60 || q.y > BAND - 20 || q.x < 30 || q.x > W - 30) continue;
        const near = placed.reduce(
          (m, p) => Math.min(m, Math.hypot(p[0] - q.x, p[1] - q.y)),
          Infinity,
        );
        const score = -Math.abs(q.r - 12) + (near < 48 ? -100 : 0) + (q.y > H / 2 ? 2 : 0);
        if (!best || score > best.score) best = { x: q.x, y: q.y, score };
      }
    }
    const label = levelNumbers.get(l.level);
    if (!best || !label) continue;
    placed.push([best.x, best.y]);
    // A patch of the disk's colour under the label breaks the line there; about 0.65 em per
    // character leaves room for wider platform fonts.
    const width = Math.ceil(label.text.length * 13 * 0.65) + 6;
    body.push(
      `<rect x="${c(best.x - width / 2)}" y="${c(best.y - 8)}" width="${width}" height="16" ` +
        `rx="3" fill="${COLOURS.diskImage}"/>`,
      text(best.x, best.y + 4.5, label.text, {
        size: 13,
        fill: styleOf(l.level).colour,
        anchor: 'middle',
      }),
    );
  }
  body.push(text(W / 2, H / 2 - 30, 'shadow', { size: 13, fill: COLOURS.muted, anchor: 'middle' }));

  const { distance, elevation, fov } = fixedNumbers;
  const towards = approachingLeft ? 16 : W - 16;
  const away = approachingLeft ? W - 16 : 16;
  const side = (x: number, y: number, label: string, t: TextStyle = {}) =>
    text(x, y, label, { size: 13, fill: COLOURS.muted, anchor: x < W / 2 ? 'start' : 'end', ...t });
  body.push(
    text(16, 34, 'Lines of constant g = ν_{seen} / ν_{emitted} on the direct image of the disk'),
    text(
      16,
      56,
      `Camera at ${distance.text} M, ${elevation.text}° above the disk, ${fov.text}° field of ` +
        "view (the page's opening view): a camera image, not r and phi",
      { size: 13, fill: COLOURS.muted },
    ),
    side(towards, 150, 'approaching side:', { size: 15, fill: COLOURS.edge }),
    side(towards, 170, 'moves towards the camera,'),
    side(towards, 188, 'blueshifted (g > 1)'),
    side(away, 150, 'receding side:', { size: 15, fill: COLOURS.orange }),
    side(away, 170, 'moves away from the camera,'),
    side(away, 188, 'redshifted (g < 1)'),
  );
  body.push(
    ...legendRow(16, 452, styleOf(1.1), 'g > 1', 13),
    ...legendRow(16, 472, styleOf(1), 'g = 1', 13),
    ...legendRow(16, 492, styleOf(0.9), 'g < 1', 13),
  );
  body.push(
    ...band(
      `On this image g runs from ${fixedNumbers.gMin.text} to ${fixedNumbers.gMax.text}. ` +
        'Brightness summed over all frequencies scales as g⁴, which differs by a factor of ' +
        `${fixedNumbers.brightness.text} between them.`,
    ),
  );

  const numbers: Record<string, PrintedNumber> = { ...fixedNumbers };
  for (const [level, p] of levelNumbers) numbers[`level ${level.toFixed(1)}`] = p;
  return {
    svg: svgDocument(
      'Frequency shift across the disk',
      `Lines of constant g on the direct image of the disk, seen by the page's opening camera at ` +
        `${distance.text} M, ${elevation.text} degrees above the disk. The ` +
        `${approachingLeft ? 'left' : 'right'} side moves towards the camera and is blueshifted. ` +
        `g runs from ${fixedNumbers.gMin.text} to ${fixedNumbers.gMax.text}.`,
      body,
    ),
    numbers,
  };
}

// ---------------------------------------------------------------------------------------------
// The set, and the rules every file must keep

export const DIAGRAMS: readonly { readonly file: string; readonly draw: () => Diagram }[] = [
  { file: 'd0-key-radii.svg', draw: keyRadii },
  { file: 'd1-light-paths.svg', draw: lightPaths },
  { file: 'd2-shadow-size.svg', draw: shadowSize },
  { file: 'd3-ring-images.svg', draw: ringImages },
  { file: 'd4-redshift.svg', draw: redshiftContours },
];

/** Substrings no diagram may contain: active content, external references, CSS, long dashes. */
export const FORBIDDEN: readonly (readonly [string, string])[] = [
  ['<script', 'script element'],
  ['href', 'link (href or xlink:href)'],
  ['<image', 'image element'],
  ['<foreignObject', 'foreignObject element'],
  ['@import', 'CSS @import'],
  ['@font-face', 'CSS @font-face'],
  [' style=', 'style attribute'],
  ['<style', 'style element'],
  ['javascript:', 'javascript URL'],
  [String.fromCharCode(0x2014), 'em-dash'],
  [String.fromCharCode(0x2013), 'en-dash'],
];

const COORDINATE_ATTRIBUTES = new Set([
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'd',
  'width',
  'height',
  'dx',
  'dy',
  'stroke-width',
]);

/** Every way the SVG breaks the rules for README diagrams; empty when it keeps them all. */
export function diagramProblems(svg: string): string[] {
  const problems: string[] = [];
  const bytes = Buffer.byteLength(svg, 'utf8');
  if (bytes > MAX_BYTES) problems.push(`${bytes} bytes, over the cap of ${MAX_BYTES}`);
  for (const [needle, name] of FORBIDDEN) {
    if (svg.includes(needle)) problems.push(`contains a forbidden ${name}`);
  }
  if (/\son[a-z]+=/i.test(svg)) problems.push('contains an event handler attribute');
  if (/NaN|Infinity/.test(svg)) problems.push('contains a non-finite number');
  if (!/^<svg [^>]*viewBox="0 0 960 540"[^>]*>/.test(svg)) {
    problems.push('the root is not <svg> with viewBox "0 0 960 540"');
  }
  if ((svg.match(/<svg[\s>]/g) ?? []).length !== 1 || !svg.endsWith('</svg>\n')) {
    problems.push('not exactly one root <svg> element');
  }
  if (!svg.includes(`<rect width="${W}" height="${H}" fill="${COLOURS.background}"/>`)) {
    problems.push('no opaque background');
  }
  if (!svg.includes(`font-family="${FONT_STACK}"`)) problems.push('not in the system font stack');
  if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(svg)) problems.push('unescaped ampersand');

  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, attrs, self] = m;
    if (close === '/') {
      if (stack.pop() !== name) problems.push(`unbalanced </${name}>`);
      continue;
    }
    for (const a of (attrs ?? '').matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) {
      if (COORDINATE_ATTRIBUTES.has(a[1]!) && /\d\.\d\d/.test(a[2]!)) {
        problems.push(`<${name}> ${a[1]} is not rounded to 0.1 px`);
        break;
      }
    }
    if (self !== '/') stack.push(name!);
  }
  if (stack.length > 0) problems.push(`unclosed <${stack.join('>, <')}>`);
  return problems;
}
