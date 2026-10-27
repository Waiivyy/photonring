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
