// Adaptive anti-aliasing: which pixels the refinement pass supersamples. Pure functions shared by
// the renderer (uniform values) and the tests; refine.wgsl evaluates the same tests per pixel.
import {
  criticalImpactParameter,
  luminance,
  shadowAngularRadius,
  srgbEncode,
  toneMap,
  type Vec3,
} from '../../physics/index.ts';

/**
 * Relative width of the critical band: impact parameters from b_c to (1 + BAND_WIDTH) b_c. It
 * holds the shadow edge, the photon ring and the higher-order disk images, whose widths shrink by
 * about e^(-pi) per order, so they become thinner than a pixel where contrast detection on a
 * one-sample image cannot see them.
 */
export const BAND_WIDTH = 0.02;

/**
 * Contrast threshold on the perceived value (sRGB-encoded, tone-mapped luminance, 0 to 1):
 * a pixel is refined when a neighbour differs by more than this, about 13 levels of 255.
 */
export const AA_THRESHOLD = 0.05;

/** Range of cos(angle between the view direction and the direction to the hole). */
export interface CriticalBand {
  readonly cosMin: number;
  readonly cosMax: number;
}

/**
 * Pixels whose footprint may contain an inward ray with b_c <= b <= (1 + width) b_c, or the
 * shadow edge itself, as a range of the cosine for the pixel centre. The footprint's angular
 * radius is at most the pixel's half-diagonal in the image plane at unit distance (the inverse
 * gnomonic projection shrinks lengths), sqrt(2) tan(fov/2) / height. Needs r_o > 3M.
 */
export function criticalBand(
  rObs: number,
  M: number,
  tanHalfFovY: number,
  height: number,
  width = BAND_WIDTH,
): CriticalBand {
  if (!(rObs > 3 * M)) throw new RangeError('the critical band needs r_o > 3M');
  const edge = shadowAngularRadius(rObs, M);
  const sinOuter =
    ((1 + width) * criticalImpactParameter(M) * Math.sqrt(1 - (2 * M) / rObs)) / rObs;
  const outer = Math.asin(Math.min(1, sinOuter));
  const footprint = (Math.SQRT2 * tanHalfFovY) / height;
  return {
    cosMin: Math.cos(Math.min(Math.PI, outer + footprint)),
    cosMax: Math.cos(Math.max(0, edge - footprint)),
  };
}

/** e1 is the unit vector from the hole to the observer; d the unit view direction. */
export function inCriticalBand(band: CriticalBand, e1: Vec3, d: Vec3): boolean {
  const c = -(d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2]);
  return c >= band.cosMin && c <= band.cosMax;
}

/** Brightness as displayed: luminance, tone mapped (or clamped), then sRGB-encoded. */
export function perceivedValue(rgb: Vec3, exposure: number, toneMapping: boolean): number {
  const y = Math.max(0, luminance(rgb));
  return srgbEncode(toneMapping ? toneMap(y, exposure) : Math.min(1, y));
}
