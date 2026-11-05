// Toy thin-disk model. Not a Page-Thorne solution: no relativistic corrections to the flux.
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
