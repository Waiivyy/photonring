// Exact (f64 reference) answers for planar rays traced backwards from a static observer.
import {
  criticalImpactParameter,
  impactParameterFromLocalAngle,
  orbitRoots,
  sweptAngleElliptic,
  sweptAngleQuadrature,
} from '../../src/physics/index.ts';

/**
 * Polar angle swept by a ray that starts at radius r0, at local angle psi from the outward
 * radial direction, until it reaches radius rEnd on its way out (Infinity for the escape
 * direction). Returns NaN for captured rays.
 */
export function exactSweptAngle(r0: number, psi: number, M: number, rEnd = Infinity): number {
  const b = impactParameterFromLocalAngle(r0, psi, M);
  const u0 = 1 / r0;
  const uEnd = 1 / rEnd;
  if (Math.cos(psi) >= 0) {
    // Outward: u decreases monotonically from u0 to uEnd.
    return uEnd >= u0 ? 0 : sweptAngleQuadrature(b, uEnd, u0, M);
  }
  if (b <= criticalImpactParameter(M)) return NaN;
  const { u2 } = orbitRoots(b, M);
  const inward = u0 < u2 ? sweptAngleElliptic(b, u0, u2, M) : 0;
  const outward = uEnd < u2 ? sweptAngleElliptic(b, uEnd, u2, M) : 0;
  return inward + outward;
}

/** Local angle from the outward radial that gives impact parameter b at r0 on an inward ray. */
export function inwardPsiForImpactParameter(r0: number, b: number, M: number): number {
  return Math.PI - Math.asin((b * Math.sqrt(1 - (2 * M) / r0)) / r0);
}
