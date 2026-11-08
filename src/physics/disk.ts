// Toy thin-disk model. The renderers draw the Newtonian profile below (diskTemperature), with no
// relativistic corrections to the flux. The relativistic Page-Thorne flux (Page and Thorne 1974)
// for a Schwarzschild hole follows it; no renderer uses it yet.
import { blackbodyColour } from './colour.ts';
import { iscoRadius } from './constants.ts';
import type { Vec3 } from './observer.ts';
import { circularOrbitEmitter, redshiftFactor } from './redshift.ts';

export interface DiskSettings {
  /** Inner edge; must lie outside the photon sphere (3M), normally the ISCO (6M). */
  readonly rIn: number;
  readonly rOut: number;
  /** Fraction of light absorbed and replaced by emission at each crossing, 0 to 1. */
  readonly opacity: number;
  /** Emitted temperature at the hottest radius, (49/36) r_in, in kelvin. */
  readonly peakTemperature: number;
}

/**
 * Default toy disk for M = 1: inner edge at the ISCO, outer edge at 20M, opaque, 6500 K at its
 * hottest radius (chosen at the Stage 1 check-in, docs/DESIGN.md section 10).
 */
export const DEFAULT_DISK: DiskSettings = {
  rIn: iscoRadius(1),
  rOut: 20,
  opacity: 1,
  peakTemperature: 6500,
};

/** Radius of peak temperature for the profile below, r = (49/36) r_in. */
const PEAK_RATIO = 49 / 36;
const PEAK_SHAPE = PEAK_RATIO ** -0.75 * (1 - Math.sqrt(1 / PEAK_RATIO)) ** 0.25;

/**
 * Temperature profile T(r) proportional to r^(-3/4) (1 - sqrt(r_in / r))^(1/4) (Newtonian thin
 * disk with zero torque at r_in), normalised to 1 at its peak. Zero at and inside r_in.
 */
export function diskTemperature(r: number, rIn: number): number {
  if (!(r > rIn)) return 0;
  const x = r / rIn;
  return (x ** -0.75 * (1 - Math.sqrt(1 / x)) ** 0.25) / PEAK_SHAPE;
}

/**
 * Factor k with T(r) = k x^(-3/4) (1 - x^(-1/2))^(1/4), x = r / r_in, for a disk whose hottest
 * radius has temperature peakTemperature (the form the shader evaluates).
 */
export function diskTemperatureScale(peakTemperature: number): number {
  return peakTemperature / PEAK_SHAPE;
}

// Page-Thorne flux (Page and Thorne 1974, ApJ 191, 499) for a Schwarzschild hole, a* = 0.
// Geometric units G = c = 1. x = sqrt(r / M); x0 = sqrt6 is x at the ISCO.

const SQRT3 = Math.sqrt(3);
const X0 = Math.sqrt(6);

function assertMass(M: number): void {
  if (!(M > 0 && M < Infinity)) throw new RangeError('M must be positive and finite');
}

/** artanh(z) - z for 0 <= z < 1, summed as a series below z = 0.125 to avoid cancellation. */
function atanhMinusZ(z: number): number {
  if (z < 0.125) {
    // z^3/3 + z^5/5 + ... + z^27/27: the next term is below 1e-24 of the first.
    const z2 = z * z;
    let term = z * z2;
    let sum = 0;
    for (let k = 3; k <= 27; k += 2) {
      sum += term / k;
      term *= z2;
    }
    return sum;
  }
  return Math.atanh(z) - z;
}

/**
 * The bracket of eq. (15n) at a* = 0, for x >= x0:
 *   B(x) = x - x0 - (sqrt3/2) ln[(x - sqrt3)/(x0 - sqrt3)]
 *               + (sqrt3/2) ln[(x + sqrt3)/(x0 + sqrt3)].
 * B has a double zero at x0 while each term is of order x - x0, so the sum cancels near the ISCO.
 * The same function without cancellation, with d = x - x0 and z = sqrt3 d / (x x0 - 3):
 *   B = x0 d^2 / (x x0 - 3) - sqrt3 (artanh z - z),
 * from B = d - sqrt3 artanh z (the artanh subtraction formula) and x x0 - 6 = x0 d.
 * rho6 = r/M - 6 is passed in so that d = rho6 / (x + x0) keeps its precision.
 */
function bracket(x: number, rho6: number): number {
  const d = rho6 / (x + X0);
  const q = x * X0 - 3;
  const z = (SQRT3 * d) / q;
  return (X0 * d * d) / q - SQRT3 * atanhMinusZ(z);
}

/** F M^2 at r = rho M, rho > 6: 3 B / (8 pi rho^2 (rho - 3) sqrt(rho)), 0 at infinity. */
function unitMassFlux(r: number, M: number): number {
  if (Number.isNaN(r)) throw new RangeError('radius must be a number');
  const isco = iscoRadius(M);
  if (!(r > isco)) return 0;
  const rho = r / M;
  if (rho === Infinity) return 0;
  const x = Math.sqrt(rho);
  // r - 6M is exact for r within a factor of two of 6M (Sterbenz), so the double zero keeps its
  // precision when 6M is exact; otherwise the flux is as accurate as r - 6M.
  const b = bracket(x, (r - isco) / M);
  return (3 * b) / (8 * Math.PI * rho * rho * (rho - 3) * x);
}

/** x of the peak flux: the root of h(x) = x (x^2 - 6) - (7 x^2 - 15) B(x) on [2.5, 4]. */
function peakX(): number {
  // F is proportional to B / (x^5 (x^2 - 3)) at fixed M, and dF/dx has the sign of x^4 h(x):
  // h > 0 below the peak, h < 0 above it. Bisection to adjacent doubles.
  const h = (x: number) => x * (x * x - 6) - (7 * x * x - 15) * bracket(x, x * x - 6);
  let lo = 2.5;
  let hi = 4;
  for (;;) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) return mid;
    if (h(mid) > 0) lo = mid;
    else hi = mid;
  }
}

/** Radius of the peak flux in units of M: 9.5509 (the root above, squared). */
const PEAK_RADIUS = peakX() ** 2;
/** F M^2 at the peak radius, per unit accretion rate. */
const PEAK_FLUX = unitMassFlux(PEAK_RADIUS, 1);
/** C(0) and C(1): F M^2 tends to s^6 / (576 pi) far out and to (1 - s)^2 / (144 pi) at 6M. */
const FACTOR_AT_0 = 1 / Math.sqrt(Math.sqrt(576 * Math.PI * PEAK_FLUX));
const FACTOR_AT_1 = 1 / Math.sqrt(Math.sqrt(144 * Math.PI * PEAK_FLUX));

/**
 * Energy flux from one face of the disk, per unit proper time and proper area, measured by an
 * observer who orbits with the gas, per unit rest-mass accretion rate (Page and Thorne 1974,
 * eqs. 10b, 11b, 12 and 15n with a* = 0):
 *   F = 3 M B(x) / (8 pi r^2 (r - 3M) x),  x = sqrt(r / M).
 * Zero torque at the ISCO, so F = 0 at and inside 6M whatever the disk's inner edge.
 */
export function pageThorneFlux(r: number, M: number): number {
  assertMass(M);
  return unitMassFlux(r, M) / M / M;
}

/** Radius of the peak flux and peak temperature in the gas's own frame: 9.5509 M. */
export function pageThornePeakRadius(M: number): number {
  assertMass(M);
  return PEAK_RADIUS * M;
}

/** F / F(r_peak): 1 at the peak radius, 0 at and inside the ISCO. */
export function diskFluxHat(r: number, M: number): number {
  assertMass(M);
  return unitMassFlux(r, M) / PEAK_FLUX;
}

/** (F / F(r_peak))^(1/4), the temperature in the gas's own frame over its peak value. */
export function diskTemperatureHat(r: number, M: number): number {
  return Math.sqrt(Math.sqrt(diskFluxHat(r, M)));
}

/**
 * The smooth factor C(s) of T-hat = s^(3/2) (1 - s)^(1/2) C(s), s = sqrt(6M / r) in [0, 1], for
 * the GPU table (src/gpu/host/disk-table.ts). Evaluated from s directly, without forming r:
 * x = sqrt6 / s, r/M - 6 = 6 (1 - s)(1 + s) / s^2 and
 * F M^2 / s^6 = B s / (576 pi sqrt6 (1 - s^2/2)), so
 * C = (F M^2 / (s^6 F_peak))^(1/4) / (1 - s)^(1/2). Mass independent.
 */
export function diskTemperatureFactor(s: number): number {
  if (!(s >= 0 && s <= 1)) throw new RangeError('s must be in [0, 1]');
  if (s === 1) return FACTOR_AT_1;
  // C(s) = C(0) (1 + 0.094 s + ...): below 2^-60 the difference is under a part in 1e19.
  if (s < 2 ** -60) return FACTOR_AT_0;
  const b = bracket(X0 / s, (6 * (1 - s) * (1 + s)) / (s * s));
  const fluxOverS6 = (b * s) / (576 * Math.PI * X0 * (1 - 0.5 * s * s));
  return Math.sqrt(Math.sqrt(fluxOverS6 / PEAK_FLUX)) / Math.sqrt(1 - s);
}

/**
 * Throws a RangeError unless M > 0 is finite, 6M <= rIn < rOut < infinity, 0 <= opacity <= 1 and
 * 0 < peakTemperature < infinity. An inner edge outside 6M cuts the disk off there; the zero
 * torque stays at 6M. An inner edge inside 6M is rejected: the disk would be an opaque ring
 * with no emission that hides the light behind it.
 */
export function assertDiskSettings(disk: DiskSettings, M: number): void {
  if (!(M > 0 && M < Infinity)) throw new RangeError('a disk needs M positive and finite');
  const { rIn, rOut, opacity, peakTemperature } = disk;
  if (!(rIn >= iscoRadius(M) && rOut > rIn && rOut < Infinity)) {
    throw new RangeError('disk needs 6M <= rIn < rOut < infinity');
  }
  if (!(opacity >= 0 && opacity <= 1)) throw new RangeError('opacity must be in [0, 1]');
  if (!(peakTemperature > 0 && peakTemperature < Infinity)) {
    throw new RangeError('peak temperature must be positive and finite');
  }
}

/** What the disk contributes along one traced path. */
export interface DiskLight {
  /** Disk light reaching the observer, linear sRGB. */
  readonly emission: Vec3;
  /** Fraction of the light from behind every crossing (the sky) that still gets through. */
  readonly transmittance: number;
}

/**
 * Front-to-back compositing along a traced path: each crossing inside [rIn, rOut] adds
 * opacity x blackbody(g T) and dims what lies behind by (1 - opacity). g is the frequency ratio
 * for a circular Keplerian emitter and a photon with the path's L_z / E, times the static
 * observer's factor gObserver. Negative (out of gamut) emission is clamped to zero.
 */
export function compositeDisk(
  disk: DiskSettings,
  crossingRadii: readonly number[],
  lzOverE: number,
  M: number,
  gObserver: number,
): DiskLight {
  const { rIn, rOut, opacity, peakTemperature } = disk;
  let r = 0;
  let g = 0;
  let b = 0;
  let transmittance = 1;
  for (const radius of crossingRadii) {
    if (radius < rIn || radius > rOut) continue;
    const shift = redshiftFactor(circularOrbitEmitter(radius, M), lzOverE) * gObserver;
    const e = blackbodyColour(shift * peakTemperature * diskTemperature(radius, rIn));
    const k = transmittance * opacity;
    r += k * Math.max(0, e[0]);
    g += k * Math.max(0, e[1]);
    b += k * Math.max(0, e[2]);
    transmittance *= 1 - opacity;
    if (transmittance === 0) break;
  }
  return { emission: [r, g, b], transmittance };
}

/** What the disk contributes along one path in the EHT-style view: a scalar, not a colour. */
export interface DiskBrightness {
  /** (g T-hat)^4 composited front to back, T-hat the temperature over its peak value. */
  readonly intensity: number;
  readonly transmittance: number;
}

/**
 * Brightness summed over all frequencies, composited front to back like compositeDisk. For a
 * blackbody, I_nu / nu^3 is invariant along a ray (docs/PHYSICS.md, section 9), so the observed
 * frequency-integrated intensity is g^4 times the emitted sigma T^4 / pi; in units of the peak
 * emission this is (g T-hat)^4 with T-hat = diskTemperature (docs/PHYSICS.md, section 10d). The
 * peak temperature cancels.
 */
export function compositeDiskBolometric(
  disk: DiskSettings,
  crossingRadii: readonly number[],
  lzOverE: number,
  M: number,
  gObserver: number,
): DiskBrightness {
  const { rIn, rOut, opacity } = disk;
  let intensity = 0;
  let transmittance = 1;
  for (const radius of crossingRadii) {
    if (radius < rIn || radius > rOut) continue;
    const shift = redshiftFactor(circularOrbitEmitter(radius, M), lzOverE) * gObserver;
    const q = (shift * diskTemperature(radius, rIn)) ** 2;
    intensity += transmittance * opacity * q * q;
    transmittance *= 1 - opacity;
    if (transmittance === 0) break;
  }
  return { intensity, transmittance };
}
