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

function bisect(f: (u: number) => number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  const fa = f(a);
  for (let i = 0; i < 200 && b - a > 1e-17; i++) {
    const m = (a + b) / 2;
    if (f(m) > 0 === fa > 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/**
 * Exact radius reached after sweeping the orbital angle phi, for a ray from r0 at local angle
 * psi from the outward radial. Infinity if the ray has escaped before phi; NaN if it would be
 * captured or come inside 4M first (where the reference quadrature for b <= b_c stops).
 */
export function exactRadiusAtAngle(r0: number, psi: number, phi: number, M: number): number {
  const b = impactParameterFromLocalAngle(r0, psi, M);
  const u0 = 1 / r0;
  if (Math.cos(psi) >= 0) {
    const total = sweptAngleQuadrature(b, 0, u0, M);
    if (phi >= total) return Infinity;
    // swept(u -> u0) decreases from `total` at u = 0 to 0 at u = u0.
    return 1 / bisect((u) => (u >= u0 ? 0 : sweptAngleQuadrature(b, u, u0, M)) - phi, 0, u0);
  }
  if (b <= criticalImpactParameter(M)) {
    const uMax = 1 / (4 * M);
    if (phi >= sweptAngleQuadrature(b, u0, uMax, M)) return NaN;
    return 1 / bisect((u) => (u <= u0 ? 0 : sweptAngleQuadrature(b, u0, u, M)) - phi, u0, uMax);
  }
  const { u2 } = orbitRoots(b, M);
  const inward = sweptAngleElliptic(b, u0, u2, M);
  if (phi <= inward) {
    return 1 / bisect((u) => (u <= u0 ? 0 : sweptAngleElliptic(b, u0, u, M)) - phi, u0, u2);
  }
  const rest = phi - inward;
  if (rest >= sweptAngleElliptic(b, 0, u2, M)) return Infinity;
  return 1 / bisect((u) => (u >= u2 ? 0 : sweptAngleElliptic(b, u, u2, M)) - rest, 0, u2);
}

/** Local angle from the outward radial that gives impact parameter b at r0 on an inward ray. */
export function inwardPsiForImpactParameter(r0: number, b: number, M: number): number {
  return Math.PI - Math.asin((b * Math.sqrt(1 - (2 * M) / r0)) / r0);
}
