// The photon subring strip (docs/PHYSICS.md, section 6b): the image just outside the shadow edge,
// unrolled and magnified. Column x runs once round the image, from image right towards image up;
// row y runs down in log10 of eps = b/b_c - 1, so each subring band has the same height. Pure:
// shared by the CPU renderer, the GPU host tables, the page's overlay and the tests.
import type { CameraFrame } from './camera.ts';
import { criticalImpactParameter } from './constants.ts';
import type { Vec3 } from './observer.ts';

/** Top of the strip in log10(eps), unless the largest visible offset is smaller. */
export const STRIP_TOP_LOG10 = 0.5;
/**
 * Bottom of the strip in log10(eps): orders 0 to 5 are visible, and with them the strip's 32-bit
 * limit, measured near 1e-7 to 2.4e-7 on the GPU (docs/VALIDATION.md).
 */
export const STRIP_BOTTOM_LOG10 = -7.5;

export interface StripRange {
  /** log10(eps) at the top and at the bottom edge of the strip. */
  readonly top: number;
  readonly bottom: number;
}

/** k = sqrt(1 - 2M/r_o) / r_o, with sin(alpha) = k b for a static observer (section 6). */
function kOf(rObs: number, M: number): number {
  return Math.sqrt(1 - (2 * M) / rObs) / rObs;
}

/**
 * The strip's range for an observer at rObs: the top is 10^0.5, or the largest offset seen at
 * all, where sin(alpha) = 1, whichever is smaller (log10 of 1/(k b_c) - 1: -0.616 at 5 M).
 */
export function stripRange(rObs: number, M = 1): StripRange {
  const largest = Math.log10(1 / (kOf(rObs, M) * criticalImpactParameter(M)) - 1);
  return { top: Math.min(STRIP_TOP_LOG10, largest), bottom: STRIP_BOTTOM_LOG10 };
}

/** eps at height y (in rows from the top, any real value) of a strip `height` rows tall. */
export function stripOffsetAt(y: number, height: number, range: StripRange): number {
  return 10 ** (range.top - (y * (range.top - range.bottom)) / height);
}

/** eps at the centre of row j. */
export function stripRowOffset(j: number, height: number, range: StripRange): number {
  return stripOffsetAt(j + 0.5, height, range);
}

/** Height y (in rows from the top) where eps lies: the inverse of stripOffsetAt. */
export function stripRowFromOffset(eps: number, height: number, range: StripRange): number {
  return ((range.top - Math.log10(eps)) * height) / (range.top - range.bottom);
}

/** Image angle theta (radians, from image right towards image up) at the centre of column i. */
export function stripColumnAngle(i: number, width: number): number {
  return (2 * Math.PI * (i + 0.5)) / width;
}

/** sin(alpha) of a strip direction: k b_c (1 + eps). */
export function stripSinAlpha(rObs: number, eps: number, M = 1): number {
  return kOf(rObs, M) * criticalImpactParameter(M) * (1 + eps);
}

/**
 * Unit view direction of offset eps at image angle theta:
 * cos(alpha) forward + sin(alpha) (cos(theta) right + sin(theta) up).
 */
export function stripDirection(
  frame: CameraFrame,
  rObs: number,
  eps: number,
  theta: number,
  M = 1,
): Vec3 {
  const s = Math.min(1, stripSinAlpha(rObs, eps, M));
  const c = Math.sqrt(1 - s * s);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const { forward: f, right: r, up: u } = frame;
  const d: Vec3 = [
    c * f[0] + s * (ct * r[0] + st * u[0]),
    c * f[1] + s * (ct * r[1] + st * u[1]),
    c * f[2] + s * (ct * r[2] + st * u[2]),
  ];
  const n = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / n, d[1] / n, d[2] / n];
}
