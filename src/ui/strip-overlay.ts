// What the photon subring view draws over its strip (docs/DESIGN.md, section 16): the band edges
// the 64-bit library predicts for the disk's inner and outer radius, orders 0 to 5; axis ticks
// and labels; order labels; the measured 32-bit limit; and the legend text. Geometry is in strip
// coordinates (x from 0 to 1 once round the image, log10 of eps = b/b_c - 1), so the same drawing
// serves the page (CSS px) and saved images (internal px). Pure; the edges come from a generator
// so the page can compute them in short slices.
import {
  criticalImpactParameter,
  DEFAULT_DISK,
  firstPlaneCrossingAngle,
  ringImageAngle,
  stripRange,
  subringOffset,
  type StripRange,
} from '../physics/index.ts';
import { formatNumber } from './quantise.ts';

/** Highest image order drawn: its edges lie near the 32-bit limit. */
export const STRIP_MAX_ORDER = 5;
/** Image angle step of the edge curves. */
const STEP_DEG = 2;

/**
 * The strip's 32-bit limit in eps, measured on an Apple M5 (tests/gpu/subrings.spec.ts: the
 * offset error of the order 3 and 4 edges in a face-on strip of 4096 rows, beyond the row
 * quantisation; an estimate from four edges per distance). Interpolated in log r and log eps.
 */
export const STRIP_LIMIT_MEASURED: readonly (readonly [distance: number, eps: number])[] = [
  [5, 1.2e-7],
  [30, 1.7e-7],
  [200, 2.5e-7],
];

export function stripLimit(distance: number): number {
  const pts = STRIP_LIMIT_MEASURED;
  const lr = Math.log(Math.min(pts.at(-1)![0], Math.max(pts[0]![0], distance)));
  for (let i = 1; i < pts.length; i++) {
    const [r0, e0] = pts[i - 1]!;
    const [r1, e1] = pts[i]!;
    if (lr <= Math.log(r1)) {
      const t = (lr - Math.log(r0)) / (Math.log(r1) - Math.log(r0));
      return Math.exp(Math.log(e0) + t * (Math.log(e1) - Math.log(e0)));
    }
  }
  return pts.at(-1)![1];
}

export type StripLineKind = 'inner' | 'outer' | 'limit' | 'tick';

export interface StripLine {
  readonly kind: StripLineKind;
  /** Points as (x, log10 eps), x from 0 to 1. */
  readonly points: readonly (readonly [number, number])[];
}

export interface StripLabel {
  readonly text: string;
  readonly x: number;
  readonly logEps: number;
  readonly anchor: 'start' | 'middle' | 'end';
}

export interface StripDrawing {
  readonly range: StripRange;
  readonly lines: readonly StripLine[];
  readonly labels: readonly StripLabel[];
  /** Predicted ratios of successive offsets at the image's right edge, inner disk edge, n = 1..3. */
  readonly ratios: readonly number[];
}

/** Line styles of the strip overlay: Okabe-Ito colours, each with its own dash. */
export const STRIP_STYLES: Readonly<
  Record<StripLineKind, { colour: string; dash: readonly number[]; width: number }>
> = {
  inner: { colour: '#009e73', dash: [10, 4], width: 1.5 },
  outer: { colour: '#e69f00', dash: [2, 3], width: 1.5 },
  limit: { colour: '#e8e6e3', dash: [6, 4], width: 1 },
  tick: { colour: '#e8e6e3', dash: [], width: 1 },
};

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

/** "1" for 10^0, else "10" with the exponent in superscript digits ("10⁻³"). */
export function decadeLabel(k: number): string {
  if (k === 0) return '1';
  return `10${[...String(k)].map((c) => SUPERSCRIPT[c] ?? c).join('')}`;
}

/** Offset of the order-n image of ring R for the ray plane with first crossing phi0, or null. */
function offset(distance: number, R: number, n: number, phi0: number, M: number): number | null {
  try {
    if (n >= 1) return subringOffset(distance, R, n, phi0, M);
    const k = Math.sqrt(1 - (2 * M) / distance) / distance;
    const eps =
      Math.sin(ringImageAngle(distance, R, phi0, M)) / (k * criticalImpactParameter(M)) - 1;
    return eps > 0 ? eps : null;
  } catch {
    return null;
  }
}

/**
 * The drawing for a camera at `distance` and `elevationDeg` (the azimuth does not matter). Yields
 * after every curve, so a caller can spread the work over animation frames.
 */
export function* stripDrawingJob(
  distance: number,
  elevationDeg: number,
  M = 1,
): Generator<void, StripDrawing, void> {
  const range = stripRange(distance, M);
  const el = (elevationDeg * Math.PI) / 180;
  const lines: StripLine[] = [];
  for (const [kind, R] of [
    ['inner', DEFAULT_DISK.rIn],
    ['outer', DEFAULT_DISK.rOut],
  ] as const) {
    for (let n = 0; n <= STRIP_MAX_ORDER; n++) {
      let points: [number, number][] = [];
      const flush = () => {
        if (points.length > 1) lines.push({ kind, points });
        points = [];
      };
      for (let deg = 0; deg <= 360; deg += STEP_DEG) {
        const theta = (deg * Math.PI) / 180;
        const phi0 = firstPlaneCrossingAngle(Math.sin(el), Math.sin(theta) * Math.cos(el));
        const eps = phi0 === undefined ? null : offset(distance, R, n, phi0, M);
        if (eps === null) flush();
        else points.push([deg / 360, Math.log10(eps)]);
      }
      flush();
      yield;
    }
  }

  // Order labels on their bands, a little in from the left edge (the page's toolbar and status
  // lines cover the top right and the bottom).
  const labels: StripLabel[] = [];
  const labelX = 0.06;
  const labelPhi0 =
    firstPlaneCrossingAngle(Math.sin(el), Math.sin(2 * Math.PI * labelX) * Math.cos(el)) ??
    Math.PI / 2;
  for (let n = 0; n <= STRIP_MAX_ORDER; n++) {
    const a = offset(distance, DEFAULT_DISK.rIn, n, labelPhi0, M);
    const b = offset(distance, DEFAULT_DISK.rOut, n, labelPhi0, M);
    const centre = a !== null && b !== null ? (Math.log10(a) + Math.log10(b)) / 2 : null;
    if (centre !== null && centre < range.top && centre > range.bottom) {
      labels.push({ text: `n = ${n}`, x: labelX, logEps: centre, anchor: 'start' });
    }
  }
  for (let k = Math.floor(range.top); k > range.bottom; k--) {
    lines.push({
      kind: 'tick',
      points: [
        [0, k],
        [0.008, k],
      ],
    });
    labels.push({ text: decadeLabel(k), x: 0.011, logEps: k, anchor: 'start' });
  }
  const below = range.top - 0.1 * (range.top - range.bottom);
  [
    ['right', 0.03],
    ['up', 0.25],
    ['left', 0.5],
    ['down', 0.75],
  ].forEach(([text, x]) =>
    labels.push({ text: text as string, x: (x as number) + 0.004, logEps: below, anchor: 'start' }),
  );
  const limit = Math.log10(stripLimit(distance));
  if (limit > range.bottom) {
    lines.push({
      kind: 'limit',
      points: [
        [0, limit],
        [1, limit],
      ],
    });
    labels.push({ text: '32-bit limit', x: 0.5, logEps: limit, anchor: 'middle' });
  }
  return { range, lines, labels, ratios: stripRatios(distance, M) };
}

/**
 * Predicted ratios of successive offsets of the disk's inner edge at the image's right edge, where
 * every view has phi0 = pi/2 (docs/PHYSICS.md, section 6b), for n = 1 to 2, 2 to 3 and 3 to 4.
 */
export function stripRatios(distance: number, M = 1): number[] {
  return [1, 2, 3].map((n) => {
    const a = offset(distance, DEFAULT_DISK.rIn, n, Math.PI / 2, M);
    const b = offset(distance, DEFAULT_DISK.rIn, n + 1, Math.PI / 2, M);
    return a !== null && b !== null ? a / b : NaN;
  });
}

export function stripDrawing(distance: number, elevationDeg: number, M = 1): StripDrawing {
  const job = stripDrawingJob(distance, elevationDeg, M);
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
  }
}

/** Box coordinates of a strip point (x from 0 to 1, log10 eps) in a width x height box. */
export function stripPoint(
  [x, logEps]: readonly [number, number],
  range: StripRange,
  width: number,
  height: number,
): [number, number] {
  return [x * width, ((range.top - logEps) * height) / (range.top - range.bottom)];
}

/** The view's label lines, in order. */
export function stripLegendLines(s: {
  readonly disk: boolean;
  readonly ratios: readonly number[] | null;
}): string[] {
  const lines: string[] = [];
  if (!s.disk) lines.push('Disk off: turn it on (D) to see its images.');
  lines.push('Magnified, logarithmic: not what a camera sees.');
  lines.push(
    'Across: once round the image. Down: distance from the shadow edge, in b/b_c - 1, on a ' +
      'logarithmic scale.',
  );
  lines.push(
    'Bands: images of the disk made by light that circled the hole n more half-turns ' +
      '(n = 0 is the direct image).',
  );
  lines.push(
    "Lines: the disk's inner edge (green, dashed) and outer edge (orange, dotted), as the " +
      '64-bit library predicts them, drawn even where the near side of the disk hides a band.',
  );
  if (s.ratios && s.ratios.every(Number.isFinite)) {
    const [a, b, c] = s.ratios.map((r) => formatNumber(r, 2));
    lines.push(
      `Spacing at the image's right edge, predicted: n = 1 to 2: ${a}, 2 to 3: ${b}, ` +
        `3 to 4: ${c}; e^π = ${formatNumber(Math.exp(Math.PI), 2)}.`,
    );
  }
  lines.push('White, dashed: the 32-bit limit, measured on an Apple M5.');
  return lines;
}
