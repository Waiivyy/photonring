// Lensed images of circles in the disk plane, for the overlays: the view angle at which a static
// observer sees the point of radius R that a backward ray reaches after a given orbital sweep.
// Derivation, branches and uniqueness: docs/PHYSICS.md, section 6a.
import { criticalImpactParameter } from './constants.ts';
import { sweptAngleElliptic, sweptAnglePlunging } from './deflection.ts';
import { shadowAngularRadius } from './observer.ts';
import { orbitRoots } from './orbits.ts';

/**
 * Brent's method for a root of f in [a, b], where f(a) and f(b) have opposite signs (or one is
 * zero). Stops when the bracket is below `tol` (plus rounding) or after 100 iterations.
 */
function brent(f: (x: number) => number, lo: number, hi: number, tol: number): number {
  let a = lo;
  let b = hi;
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa > 0 === fb > 0) throw new RangeError('ring image root is not bracketed');
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let i = 0; i < 100; i++) {
    if (fb > 0 === fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const t = 2 * Number.EPSILON * Math.abs(b) + tol;
    const m = 0.5 * (c - b);
    if (Math.abs(m) <= t || fb === 0) return b;
    if (Math.abs(e) >= t && Math.abs(fa) > Math.abs(fb)) {
      // Inverse quadratic interpolation, or the secant step when only two points are distinct.
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * m * s;
        q = 1 - s;
      } else {
        const qa = fa / fc;
        const r = fb / fc;
        p = s * (2 * m * qa * (qa - r) - (b - a) * (r - 1));
        q = (qa - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(t * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = m;
        e = d;
      }
    } else {
      d = m;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > t ? d : m > 0 ? t : -t;
    fb = f(b);
  }
  return b;
}

/** Closest offset from the shadow edge used in a bracket, relative to the edge angle. */
const EDGE_OFFSET = 1e-13;

/**
 * View angle alpha in (0, pi), measured from the direction to the hole, at which a static
 * observer at rObs (> 3M) sees the point of radius R (>= 2M) in the disk plane that the backward
 * ray reaches after sweeping the orbital angle `sweep` in (0, 4 pi]. The image of order n of a
 * ring point lies at the sweep of the (n+1)-th disk-plane crossing. For every sweep the root is
 * unique, and for R <= 3M it lies inside the shadow edge.
 */
export function ringImageAngle(rObs: number, R: number, sweep: number, M = 1): number {
  if (![rObs, R, sweep, M].every(Number.isFinite) || !(M > 0)) {
    throw new RangeError('ring image inputs must be finite, with M > 0');
  }
  if (!(rObs > 3 * M)) throw new RangeError(`observer must be outside the photon sphere: ${rObs}`);
  if (!(R >= 2 * M)) throw new RangeError(`ring must be at or outside the horizon: ${R}`);
  if (!(sweep > 0 && sweep <= 4 * Math.PI))
    throw new RangeError(`sweep out of (0, 4 pi]: ${sweep}`);

  const bc = criticalImpactParameter(M);
  const bcBelow = bc * (1 - Number.EPSILON);
  const bcAbove = bc * (1 + Number.EPSILON);
  const uo = 1 / rObs;
  const uR = 1 / R;
  // sin(alpha) = k b for a static observer at rObs.
  const k = Math.sqrt(1 - 2 * M * uo) / rObs;
  const psi = shadowAngularRadius(rObs, M);
  const xTol = 1e-15;

  /** Impact parameter of view angle alpha, kept on the requested side of b_c. */
  const impact = (alpha: number, side: 'below' | 'above' | 'either'): number => {
    const b = Math.sin(alpha) / k;
    if (side === 'below') return Math.min(b, bcBelow);
    if (side === 'above') return Math.max(b, bcAbove);
    return Math.abs(b / bc - 1) < 1e-14 ? bcAbove : b;
  };
  /** Swept angle over [uA, uB], or over [uA, u2] if the ray turns first; 0 if empty. */
  const swept = (b: number, uA: number, uB: number): number => {
    if (b < bc) return sweptAnglePlunging(b, uA, uB, M);
    const end = Math.min(uB, orbitRoots(b, M).u2);
    return end > uA ? sweptAngleElliptic(b, uA, end, M) : 0;
  };
  /** Inward from the observer to the turning point u2, then out to R (b > b_c, u2 >= uR). */
  const outAndBack = (b: number): number => {
    const { u2 } = orbitRoots(b, M);
    return swept(b, uo, u2) + (u2 > uR ? sweptAngleElliptic(b, uR, u2, M) : 0);
  };
  const belowEdge = (x: number) => psi - Math.exp(x);
  const aboveEdge = (x: number) => psi + Math.exp(x);
  const xNearEdge = Math.log(psi * EDGE_OFFSET);

  if (Math.abs(R / rObs - 1) <= 1e-12) {
    // Outward rays never come back to rObs; inward ones with b > b_c turn and return.
    const f = (x: number) => outAndBack(impact(aboveEdge(x), 'above')) - sweep;
    const xHigh = Math.log(Math.PI / 2 - psi);
    if (f(xHigh) >= 0) return Math.PI / 2;
    return aboveEdge(brent(f, xNearEdge, xHigh, xTol));
  }

  if (R < rObs) {
    if (R <= 3 * M) {
      // Only plunging rays reach R; the inbound sweep grows from 0 to infinity towards the edge.
      const f = (x: number) => swept(impact(belowEdge(x), 'below'), uo, uR) - sweep;
      return belowEdge(brent(f, xNearEdge, Math.log(psi * (1 - 1e-12)), xTol));
    }
    // R > 3M: inbound branch up to the ray that turns exactly at R, then the outbound branch.
    const alphaTurn = Math.asin((k * R) / Math.sqrt(1 - 2 * M * uR));
    const inbound = (alpha: number) => swept(impact(alpha, 'either'), uo, uR);
    const phiStar = inbound(alphaTurn);
    if (sweep <= phiStar) return brent((a) => inbound(a) - sweep, 1e-14, alphaTurn, xTol);
    const f = (x: number) => outAndBack(impact(aboveEdge(x), 'above')) - sweep;
    const xHigh = Math.log(alphaTurn - psi);
    if (f(xHigh) >= 0) return alphaTurn;
    return aboveEdge(brent(f, xNearEdge, xHigh, xTol));
  }

  // R > rObs: outward rays go straight out to R; inward ones with b > b_c turn and come out.
  const f = (x: number) => {
    const alpha = aboveEdge(x);
    if (alpha >= Math.PI / 2) return swept(impact(alpha, 'either'), uR, uo) - sweep;
    return outAndBack(impact(alpha, 'above')) - sweep;
  };
  return aboveEdge(brent(f, xNearEdge, Math.log(Math.PI * (1 - 1e-12) - psi), xTol));
}
