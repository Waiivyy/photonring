// Radius reached by a planar backward ray after a given orbital sweep, for the ring-image tests.
import { f64, integrateBinet } from '../../src/physics/index.ts';

/**
 * Radius reached after the orbital sweep `sweep` by the ray leaving a static observer at r_o at
 * angle alpha from the direction to the hole, by the Binet integrator (f64). Capture is set below
 * R but never above 3M, where captured rays could still turn round. Returns 0 if the ray is
 * captured first and Infinity if it escapes first.
 */
export function binetRadiusAt(
  rObs: number,
  R: number,
  alpha: number,
  sweep: number,
  dphi = 5e-4,
  M = 1,
): number {
  const u0 = 1 / rObs;
  const w0 = u0 * Math.sqrt(1 - 2 * M * u0) * (Math.cos(alpha) / Math.sin(alpha));
  const res = integrateBinet(M, u0, w0, {
    round: f64,
    dphi,
    maxSteps: Math.ceil(sweep / dphi) + 10,
    uCapture: 1 / Math.min(3 * M, 0.9 * R),
    firstCrossing: sweep,
  });
  const c = res.crossings[0];
  if (c && c.phi === sweep) return 1 / c.u;
  return res.termination === 'captured' ? 0 : Infinity;
}
