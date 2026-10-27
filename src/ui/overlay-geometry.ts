// Overlay curves in the image plane, from the f64 library: the analytic shadow edge and the
// lensed images of the disk-plane circles r = 2M, 3M and 6M. Points are kept in tan-plane
// coordinates (sx, sy) = tan(alpha) (cos theta, sin theta) around the optical axis, so a curve
// depends only on the distance and the elevation, never on the azimuth or the image size.
// Pure, DOM-free. Physics: docs/PHYSICS.md, section 6a.
import {
  firstPlaneCrossingAngle,
  ringFoldSweep,
  ringImageAngle,
  shadowAngularRadius,
} from '../physics/index.ts';

export type RingRadius = 2 | 3 | 6;
export type ImageOrder = 0 | 1;
export type TanPoint = readonly [number, number];

export interface RingCurveRequest {
  readonly rObs: number;
  readonly elevationDeg: number;
  readonly R: RingRadius;
  readonly order: ImageOrder;
  readonly tanHalfFovY: number;
  /** Image width over height. */
  readonly aspect: number;
}

export interface TanCurve {
  /** Polylines; a new one starts wherever the curve breaks. */
  readonly segments: readonly (readonly TanPoint[])[];
  readonly vertices: number;
}

/** Image box the tan plane is mapped into: pixels (or CSS px) and the rendered image's shape. */
export interface ImageView {
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
  readonly tanHalfFovY: number;
}

export const BASE_SAMPLES = 256;
export const MAX_DEPTH = 12;
export const MAX_VERTICES = 2048;
/** Image points this far from the optical axis (beside or behind the camera) are not drawn. */
export const MAX_IMAGE_ANGLE = (89.5 * Math.PI) / 180;
/** Viewport margin, as a fraction of the half-extents, inside which segments are refined. */
const MARGIN = 1.1;

const DEG = Math.PI / 180;

/** Chord tolerance in tan units: 0.1 px at 2160 rows. */
export function chordTolerance(tanHalfFovY: number): number {
  return (0.1 * 2 * tanHalfFovY) / 2160;
}

export function edgeTanRadius(rObs: number): number {
  return Math.tan(shadowAngularRadius(rObs, 1));
}

/**
 * Tan-plane point of the order-n image of the ring R in image direction theta (radians from
 * image right towards image up), or null where the curve breaks: the ray plane is the disk
 * plane, or the image lies MAX_IMAGE_ANGLE or more from the optical axis.
 */
export function ringImagePoint(
  rObs: number,
  elevationDeg: number,
  R: RingRadius,
  order: ImageOrder,
  theta: number,
): TanPoint | null {
  const el = elevationDeg * DEG;
  // The camera's right vector is horizontal and its up vector has z = cos(el), so the ray plane
  // (towards the observer, then towards image direction theta) has these z components.
  const phi0 = firstPlaneCrossingAngle(Math.sin(el), Math.sin(theta) * Math.cos(el));
  if (phi0 === undefined) return null;
  const alpha = ringImageAngle(rObs, R, phi0 + order * Math.PI, 1);
  if (alpha >= MAX_IMAGE_ANGLE) return null;
  const t = Math.tan(alpha);
  return [t * Math.cos(theta), t * Math.sin(theta)];
}

/** Distance from p to the segment ab (to its nearer end beyond the segment). */
function segmentDistance(p: TanPoint, a: TanPoint, b: TanPoint): number {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len2 = ex * ex + ey * ey;
  const t =
    len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / len2));
  return Math.hypot(p[0] - a[0] - t * ex, p[1] - a[1] - t * ey);
}

/**
 * The uniform directions, plus the directions where the curve folds back (the image of the ray
 * that turns exactly at R, its outermost point): near edge-on views that tip is narrower than
 * the uniform spacing. The fold sweep phi0 + n pi = Phi gives tan(phi0) = -tan(el) / sin(theta).
 */
function sampleDirections(
  rObs: number,
  elevationDeg: number,
  R: RingRadius,
  order: ImageOrder,
): number[] {
  const thetas = Array.from({ length: BASE_SAMPLES }, (_, i) => (2 * Math.PI * i) / BASE_SAMPLES);
  const fold = ringFoldSweep(rObs, R, 1);
  const el = elevationDeg * DEG;
  if (fold !== null && el !== 0) {
    const target = fold - order * Math.PI;
    if (target > 0 && target <= Math.PI) {
      const s = -Math.tan(el) / Math.tan(target);
      if (Math.abs(s) <= 1) {
        for (const t of [Math.asin(s), Math.PI - Math.asin(s)]) {
          const theta = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          const phi0 = firstPlaneCrossingAngle(Math.sin(el), Math.sin(theta) * Math.cos(el));
          if (phi0 !== undefined && Math.abs(phi0 - target) < 1e-9) thetas.push(theta);
        }
      }
    }
  }
  thetas.sort((a, b) => a - b);
  return thetas.filter((t, i) => i === 0 || t - (thetas[i - 1] as number) > 1e-12);
}

interface Sample {
  readonly theta: number;
  readonly p: TanPoint;
  /** Bisection depth at which the sample was found (0 for the uniform directions). */
  readonly depth: number;
}

/**
 * Builds the curve by adaptive sampling in theta: 256 uniform directions plus the fold
 * directions, each interval bisected while the true midpoint is more than chordTolerance from
 * the chord (to depth MAX_DEPTH, and only where the chords meet the viewport), and bisected
 * towards breaks to the same depth. At most
 * MAX_VERTICES vertices. Yields after every evaluated point, so a caller can spread the work over
 * frames. Off-screen coordinates are kept as they are: below MAX_IMAGE_ANGLE they stay small
 * enough for SVG and canvas paths.
 */
export function* ringCurveJob(req: RingCurveRequest): Generator<void, TanCurve, void> {
  const { rObs, elevationDeg, R, order, tanHalfFovY, aspect } = req;
  const tol = chordTolerance(tanHalfFovY);
  const halfW = MARGIN * aspect * tanHalfFovY;
  const halfH = MARGIN * tanHalfFovY;
  const point = (theta: number) => ringImagePoint(rObs, elevationDeg, R, order, theta);
  /** Whether the segment pq meets the viewport plus its margin (Liang-Barsky clipping). */
  const crosses = (p: TanPoint, q: TanPoint): boolean => {
    let t0 = 0;
    let t1 = 1;
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    for (const [den, num] of [
      [-dx, p[0] + halfW],
      [dx, halfW - p[0]],
      [-dy, p[1] + halfH],
      [dy, halfH - p[1]],
    ] as const) {
      if (den === 0) {
        if (num < 0) return false;
      } else {
        const t = num / den;
        if (den < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
        if (t0 > t1) return false;
      }
    }
    return true;
  };

  const thetas = sampleDirections(rObs, elevationDeg, R, order);
  const base: (TanPoint | null)[] = [];
  for (const theta of thetas) {
    base.push(point(theta));
    yield;
  }

  const segments: TanPoint[][] = [];
  let current: TanPoint[] = [];
  let vertices = 0;
  // Uniform samples still to be emitted, kept in reserve so the cap holds.
  let reserved = base.filter((p) => p !== null).length;
  const push = (p: TanPoint) => {
    current.push(p);
    vertices++;
  };
  const endSegment = () => {
    if (current.length > 1) segments.push(current);
    else vertices -= current.length;
    current = [];
  };
  const canRefine = () => vertices + reserved + 2 <= MAX_VERTICES;

  /** Emits refined points strictly between samples a and b, in theta order. */
  function* refine(a: Sample, b: Sample): Generator<void> {
    const depth = Math.max(a.depth, b.depth) + 1;
    if (depth > MAX_DEPTH || !canRefine()) return;
    const theta = (a.theta + b.theta) / 2;
    const p = point(theta);
    yield;
    if (p === null) {
      yield* approach(a, theta, depth);
      endSegment();
      yield* approach(b, theta, depth);
      return;
    }
    const m: Sample = { theta, p, depth };
    // A chord whose midpoint is within tolerance is kept as it is. Off screen, a chord that
    // misses the viewport (with its margin) only gets its midpoint, so it stays off screen.
    if (segmentDistance(p, a.p, b.p) <= tol) return;
    if (crosses(a.p, p) || crosses(p, b.p) || crosses(a.p, b.p)) {
      yield* refine(a, m);
      push(p);
      yield* refine(m, b);
    } else {
      push(p);
    }
  }

  /**
   * Bisects from the valid sample `from` towards a break at `breakTheta`, and emits the valid
   * points found, in theta order, between `from` and the break (not `from` itself).
   */
  function* approach(from: Sample, breakTheta: number, depth: number): Generator<void> {
    const found: Sample[] = [];
    let valid = from;
    let broken = breakTheta;
    for (let d = depth; d <= MAX_DEPTH && canRefine(); d++) {
      const theta = (valid.theta + broken) / 2;
      const p = point(theta);
      yield;
      if (p === null) broken = theta;
      else {
        valid = { theta, p, depth: d };
        found.push(valid);
      }
    }
    const ordered = breakTheta > from.theta ? found : found.reverse();
    let prev: Sample | null = breakTheta > from.theta ? from : null;
    for (const s of ordered) {
      if (prev) yield* refine(prev, s);
      push(s.p);
      prev = s;
    }
    if (breakTheta < from.theta && prev) yield* refine(prev, from);
  }

  // Walk the closed loop of uniform samples, starting at a break if there is one, so that no
  // segment wraps through the start; without breaks, the first point closes the loop.
  const n = thetas.length;
  const firstBreak = base.indexOf(null);
  const start = firstBreak < 0 ? 0 : firstBreak;
  /** Direction of the k-th sample after `start`, unwrapped so it keeps increasing. */
  const thetaAt = (k: number) =>
    (thetas[(start + k) % n] as number) + 2 * Math.PI * Math.floor((start + k) / n);
  const sampleAt = (k: number): Sample | null => {
    const p = base[(start + k) % n] ?? null;
    return p ? { theta: thetaAt(k), p, depth: 0 } : null;
  };
  let prev = sampleAt(0);
  if (prev) {
    push(prev.p);
    reserved--;
  }
  for (let k = 1; k <= n; k++) {
    const s = sampleAt(k);
    if (s && k < n) reserved--;
    if (prev && s) {
      yield* refine(prev, s);
      push(s.p);
    } else if (prev && !s) {
      yield* approach(prev, thetaAt(k), 1);
      endSegment();
    } else if (!prev && s) {
      yield* approach(s, thetaAt(k - 1), 1);
      push(s.p);
    }
    prev = s;
  }
  endSegment();
  return { segments, vertices };
}

/** Runs a curve job to completion. */
export function ringCurve(req: RingCurveRequest): TanCurve {
  const job = ringCurveJob(req);
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
  }
}

/** Maps a tan-plane point into an image box: the inverse of pixelDirection, stretched. */
export function projectTan([sx, sy]: TanPoint, view: ImageView): [number, number] {
  const t = view.tanHalfFovY;
  return [(view.width / 2) * (1 + sx / (view.aspect * t)), (view.height / 2) * (1 - sy / t)];
}

/** The shadow edge in an image box: a circle in angle, an ellipse when the box is stretched. */
export function edgeEllipse(
  rObs: number,
  view: ImageView,
): { cx: number; cy: number; rx: number; ry: number } {
  const tanPsi = edgeTanRadius(rObs);
  return {
    cx: view.width / 2,
    cy: view.height / 2,
    rx: ((view.width / 2) * tanPsi) / (view.aspect * view.tanHalfFovY),
    ry: ((view.height / 2) * tanPsi) / view.tanHalfFovY,
  };
}

/** SVG path data ("M x y L x y ...", a move at every break), also accepted by Path2D. */
export function pathData(curve: TanCurve, view: ImageView): string {
  const parts: string[] = [];
  for (const seg of curve.segments) {
    seg.forEach((p, i) => {
      const [x, y] = projectTan(p, view);
      parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
    });
  }
  return parts.join('');
}
