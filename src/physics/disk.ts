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
