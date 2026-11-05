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
 * How a bracket end is approached. Near a singular end the solver works in a logarithmic
 * variable measured from that end, so angles very close to 0, to pi or to the shadow edge keep
 * full relative precision; 'plain' is alpha itself, for regular ends.
 */
type EndKind = 'zero' | 'pi' | 'below' | 'above' | 'plain';

interface End {
  readonly kind: EndKind;
  readonly alpha: number;
}

/**
 * View angle alpha in (0, pi), measured from the direction to the hole, at which a static
 * observer at rObs (> 3M) sees the point of radius R (>= 2M) in the disk plane that the backward
 * ray reaches after sweeping the orbital angle `sweep` in (0, 4 pi]. The image of order n of a
 * ring point lies at the sweep of the (n+1)-th disk-plane crossing. For every sweep the root is
 * unique, and for R <= 3M it lies inside the shadow edge. A root nearer the edge than
 * EDGE_OFFSET (relative) is returned at that distance; this happens only for observers within
 * about 0.01M of the photon sphere, where the impact parameter barely changes near the edge.
 */
export function ringImageAngle(rObs: number, R: number, sweep: number, M = 1): number {
  if (![rObs, R, sweep, M].every(Number.isFinite) || !(M > 0)) {
    throw new RangeError('ring image inputs must be finite, with M > 0');
  }
  if (!(rObs > 3 * M)) throw new RangeError(`observer must be outside the photon sphere: ${rObs}`);
  if (!(R >= 2 * M)) throw new RangeError(`ring must be at or outside the horizon: ${R}`);
  if (!(sweep > 0 && sweep <= 4 * Math.PI)) {
    throw new RangeError(`sweep out of (0, 4 pi]: ${sweep}`);
  }

  const bc = criticalImpactParameter(M);
  const bcBelow = bc * (1 - Number.EPSILON);
  const bcAbove = bc * (1 + Number.EPSILON);
  const uo = 1 / rObs;
  const uR = 1 / R;
  // sin(alpha) = k b for a static observer at rObs.
  const k = Math.sqrt(1 - 2 * M * uo) / rObs;
  const psi = shadowAngularRadius(rObs, M);

  /** Impact parameter from sin(alpha), kept on the requested side of b_c. */
  const impact = (sinAlpha: number, side: 'below' | 'above' | 'either'): number => {
    const b = sinAlpha / k;
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
  /**
   * Far end of a bracket: a nearly radial ray whose sweep is surely below `sweep`. For any
   * b <= b_c/2, 1/sqrt(P) <= b / sqrt(1 - (b/b_c)^2) <= 1.155 b, so over an interval of width du
   * the sweep is at most 1.155 b du; b = sweep / (4 du) keeps it below 0.29 sweep.
   */
  const farAngle = (du: number) => Math.asin(k * Math.min((0.25 * sweep) / du, bc / 2));

  const toVar = (e: End, alpha: number): number => {
    switch (e.kind) {
      case 'zero':
        return Math.log(alpha);
      case 'pi':
        return Math.log(Math.PI - alpha);
      case 'below':
        return Math.log(psi - alpha);
      case 'above':
        return Math.log(alpha - psi);
      case 'plain':
        return alpha;
    }
  };
  /** alpha and sin(alpha) of a variable value, the sine computed without cancellation. */
  const fromVar = (e: End, v: number): [number, number] => {
    switch (e.kind) {
      case 'zero': {
        const d = Math.exp(v);
        return [d, Math.sin(d)];
      }
      case 'pi': {
        const d = Math.exp(v);
        return [Math.PI - d, Math.sin(d)];
      }
      case 'below': {
        const a = psi - Math.exp(v);
        return [a, Math.sin(a)];
      }
      case 'above': {
        const a = psi + Math.exp(v);
        return [a, Math.sin(a)];
      }
      case 'plain':
        return [v, Math.sin(v)];
    }
  };
  /** The point next to an end where the solver may evaluate (edges cannot be reached). */
  const nearEnd = (e: End): number =>
    e.kind === 'below'
      ? psi * (1 - EDGE_OFFSET)
      : e.kind === 'above'
        ? psi * (1 + EDGE_OFFSET)
        : e.alpha;

  /**
   * Root of sweepAt(alpha) = sweep on a monotone branch from `low` (sweep below the target) to
   * `high` (sweep above it). The bracket is split once at its midpoint, and the half holding
   * the root is solved in the variable of its own end.
   */
  const solve = (
    sweepAt: (alpha: number, sinAlpha: number) => number,
    low: End,
    high: End,
  ): number => {
    const f = (e: End) => (v: number) => {
      const [a, sa] = fromVar(e, v);
      return sweepAt(a, sa) - sweep;
    };
    const hiAlpha = nearEnd(high);
    if (f(high)(toVar(high, hiAlpha)) <= 0) return hiAlpha;
    const loAlpha = nearEnd(low);
    if (f(low)(toVar(low, loAlpha)) >= 0) return loAlpha;
    const mid = (loAlpha + hiAlpha) / 2;
    const fMid = sweepAt(mid, Math.sin(mid)) - sweep;
    if (fMid === 0) return mid;
    const end = fMid > 0 ? low : high;
    const other = fMid > 0 ? loAlpha : hiAlpha;
    const v = brent(f(end), toVar(end, other), toVar(end, mid), 1e-15);
    return fromVar(end, v)[0];
  };

  if (Math.abs(R / rObs - 1) <= 1e-12) {
    // Outward rays never come back to rObs; inward ones with b > b_c turn and return.
    return solve(
      (_a, sa) => outAndBack(impact(sa, 'above')),
      { kind: 'plain', alpha: Math.PI / 2 },
      { kind: 'above', alpha: psi },
    );
  }

  if (R < rObs) {
    const low: End = { kind: 'zero', alpha: farAngle(uR - uo) };
    if (R <= 3 * M) {
      // Only plunging rays reach R; the inbound sweep grows from 0 to infinity towards the edge.
      return solve((_a, sa) => swept(impact(sa, 'below'), uo, uR), low, {
        kind: 'below',
        alpha: psi,
      });
    }
    // R > 3M: inbound branch up to the ray that turns exactly at R, then the outbound branch.
    const alphaTurn = Math.asin((k * R) / Math.sqrt(1 - 2 * M * uR));
    const inbound = (_a: number, sa: number) => swept(impact(sa, 'either'), uo, uR);
    const phiStar = inbound(alphaTurn, Math.sin(alphaTurn));
    if (sweep <= phiStar) return solve(inbound, low, { kind: 'plain', alpha: alphaTurn });
    // For R just above 3M the outbound branch is narrower than rounding: its images are the edge.
    if (!(alphaTurn > psi * (1 + EDGE_OFFSET))) return psi;
    return solve(
      (_a, sa) => outAndBack(impact(sa, 'above')),
      { kind: 'plain', alpha: alphaTurn },
      { kind: 'above', alpha: psi },
    );
  }

  // R > rObs: outward rays go straight out to R; inward ones with b > b_c turn and come out.
  return solve(
    (a, sa) =>
      a >= Math.PI / 2 ? swept(impact(sa, 'either'), uR, uo) : outAndBack(impact(sa, 'above')),
    { kind: 'pi', alpha: Math.PI - farAngle(uo - uR) },
    { kind: 'above', alpha: psi },
  );
}

/**
 * Sweep at which the image of the ring R folds back: the ray that turns exactly at R, which is
 * seen at the largest angle of any ray reaching R. Defined for 3M < R < rObs; null otherwise
 * (rings at or inside 3M are reached only by plunging rays, and rings beyond the observer by
 * rays that never turn inside them).
 */
export function ringFoldSweep(rObs: number, R: number, M = 1): number | null {
  if (!(R > 3 * M && R < rObs && Number.isFinite(rObs))) return null;
  const bTurn = R / Math.sqrt(1 - (2 * M) / R);
  if (!(bTurn > criticalImpactParameter(M))) return null;
  const { u2 } = orbitRoots(bTurn, M);
  const uo = 1 / rObs;
  return u2 > uo ? sweptAngleElliptic(bTurn, uo, u2, M) : null;
}

/** Constant of the strong deflection limit, C = 216 (7 - 4 sqrt 3) (Bozza 2002, eq. 50). */
const STRONG_DEFLECTION_C = 216 * (7 - 4 * Math.sqrt(3));
/** Smallest offset eps = b/b_c - 1 the solver returns: b carries eps only to about 2e-16. */
const MIN_OFFSET = 1e-14;

/**
 * Orbital angle swept by the critical photon (b = b_c) from infinity in to u, for 0 <= u < 1/(3M).
 * At b = b_c the orbit polynomial is 2M (u - 1/(3M))^2 (u + 1/(6M)), and the substitution
 * u = -1/(6M) + tanh^2(x) / (2M) gives du / sqrt(P) = 2 dx. Derivation: docs/PHYSICS.md, 6b.
 */
export function criticalOrbitSweep(u: number, M = 1): number {
  if (!(u >= 0 && u < 1 / (3 * M) && M > 0)) {
    throw new RangeError(`need 0 <= u < 1/(3M) and M > 0, got u = ${u}, M = ${M}`);
  }
  return 2 * (Math.atanh(Math.sqrt(2 * M * u + 1 / 3)) - Math.atanh(1 / Math.sqrt(3)));
}

/**
 * Orbital angle swept by a backward ray of impact parameter b > b_c that runs in from uo to its
 * turning point u2 and out again to uR (inverse radii; 0 means infinity). A leg is empty when the
 * ray turns at or before reaching it.
 */
export function outboundSweep(b: number, uo: number, uR: number, M = 1): number {
  if (!(b > criticalImpactParameter(M))) throw new RangeError(`need b > b_c, got ${b}`);
  const { u2 } = orbitRoots(b, M);
  const leg = (u: number) => (u2 > u ? sweptAngleElliptic(b, u, u2, M) : 0);
  return leg(uo) + leg(uR);
}

/**
 * Offset eps = b/b_c - 1 of the image on the outbound branch (the ray turns, then meets the ring)
 * whose sweep from uo to uR equals `sweep`, for inverse radii 0 <= uo, uR < 1/(3M) (0 means
 * infinity). The sweep falls monotonically from infinity at b_c to its value for the ray that
 * turns at the larger inverse radius (or to pi when both are 0), so the root is unique. Solved by
 * Brent's method in ln(eps), which keeps full relative precision in eps; the bracket starts at the
 * leading-order estimate of docs/PHYSICS.md 6b. Throws if the root is not on this branch or lies
 * below MIN_OFFSET.
 */
export function outboundImageOffset(uo: number, uR: number, sweep: number, M = 1): number {
  if (![uo, uR, sweep, M].every(Number.isFinite) || !(M > 0)) {
    throw new RangeError('outbound image inputs must be finite, with M > 0');
  }
  if (!(uo >= 0 && uR >= 0 && Math.max(uo, uR) < 1 / (3 * M))) {
    throw new RangeError(`need 0 <= uo, uR < 1/(3M), got ${uo}, ${uR}`);
  }
  if (!(sweep > 0)) throw new RangeError(`sweep must be positive: ${sweep}`);
  const bc = criticalImpactParameter(M);
  const uTurn = Math.max(uo, uR);
  // Largest offset on the branch: the ray that turns exactly at the outer end of the path.
  const vMax =
    uTurn > 0 ? Math.log(1 / (uTurn * Math.sqrt(1 - 2 * M * uTurn)) / bc - 1) : Math.log(1e6);
  const f = (v: number) => outboundSweep(bc * (1 + Math.exp(v)), uo, uR, M) - sweep;
  const vMin = Math.log(MIN_OFFSET);

  const lead =
    Math.log(STRONG_DEFLECTION_C) - criticalOrbitSweep(uo, M) - criticalOrbitSweep(uR, M);
  const tooClose = () => new RangeError(`image of sweep ${sweep} is closer than ${MIN_OFFSET}`);
  // Below the floor b = b_c (1 + eps) no longer carries eps, so the search never goes there.
  if (f(vMin) < 0) throw tooClose();
  let hi = Math.max(Math.min(lead - sweep + 2, vMax), vMin);
  let lo = Math.max(Math.min(lead - sweep - 2, hi - 1), vMin);
  while (f(hi) > 0) {
    if (hi >= vMax) throw new RangeError(`sweep ${sweep} is below the outbound branch`);
    hi = Math.min(hi + 4, vMax);
  }
  while (f(lo) < 0) lo = Math.max(lo - 4, vMin);
  const eps = Math.exp(brent(f, lo, hi, 1e-15));
  if (eps < MIN_OFFSET) throw tooClose();
  return eps;
}

/**
 * Offset eps = b/b_c - 1 of the image of the ring of radius R (> 3M) in the disk plane that a
 * backward ray from a static observer at rObs (> 3M) reaches after sweeping `sweep`, for any sweep.
 * Images on the outbound branch (every image of order n >= 1 of a disk outside the ISCO) come from
 * outboundImageOffset; shorter sweeps, which only the inbound branch or outward rays reach, are
 * delegated to ringImageAngle (sweep <= 4 pi). The view angle follows from sin(alpha) = k b with
 * k = sqrt(1 - 2M/rObs) / rObs.
 */
export function ringImageOffset(rObs: number, R: number, sweep: number, M = 1): number {
  if (![rObs, R, sweep, M].every(Number.isFinite) || !(M > 0)) {
    throw new RangeError('ring image inputs must be finite, with M > 0');
  }
  if (!(rObs > 3 * M)) throw new RangeError(`observer must be outside the photon sphere: ${rObs}`);
  if (!(R > 3 * M)) throw new RangeError(`ring must be outside the photon sphere: ${R}`);
  if (!(sweep > 0)) throw new RangeError(`sweep must be positive: ${sweep}`);
  const uo = 1 / rObs;
  const uR = 1 / R;
  const uTurn = Math.max(uo, uR);
  const bTurn = 1 / (uTurn * Math.sqrt(1 - 2 * M * uTurn));
  if (sweep > outboundSweep(bTurn, uo, uR, M)) return outboundImageOffset(uo, uR, sweep, M);
  const k = Math.sqrt(1 - 2 * M * uo) / rObs;
  return Math.sin(ringImageAngle(rObs, R, sweep, M)) / (k * criticalImpactParameter(M)) - 1;
}

/**
 * Offset of the order-n image (n >= 0) of the ring R, for a ray plane whose first disk-plane
 * crossing is at phi0 in (0, pi] (firstPlaneCrossingAngle): the sweep is phi0 + n pi.
 */
export function subringOffset(rObs: number, R: number, n: number, phi0: number, M = 1): number {
  if (!(Number.isInteger(n) && n >= 0)) throw new RangeError(`order must be an integer >= 0: ${n}`);
  if (!(phi0 > 0 && phi0 <= Math.PI)) throw new RangeError(`phi0 out of (0, pi]: ${phi0}`);
  return ringImageOffset(rObs, R, phi0 + n * Math.PI, M);
}

/**
 * Leading-order offset eps_n = C exp(-dphi_c(1/rObs) - dphi_c(1/R) - phi0 - n pi), with
 * C = 216 (7 - 4 sqrt 3): Bozza's strong deflection law applied to each leg, with the critical
 * orbit's sweep criticalOrbitSweep for the finite ends (docs/PHYSICS.md, 6b).
 */
export function subringOffsetLeadingOrder(
  rObs: number,
  R: number,
  n: number,
  phi0: number,
  M = 1,
): number {
  const sweep = phi0 + n * Math.PI;
  return (
    STRONG_DEFLECTION_C *
    Math.exp(-criticalOrbitSweep(1 / rObs, M) - criticalOrbitSweep(1 / R, M) - sweep)
  );
}
