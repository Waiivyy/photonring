// Planar geodesic integrators, the candidates of the Stage 0 precision spike.
//
// Each traces a ray backwards from a static observer on the +x axis at radius r0, in the plane of
// the ray, starting at local angle psi from the outward radial direction. Every arithmetic
// operation goes through `round`, so the same code runs in f64 (identity) and in an f32 emulation
// (Math.fround, which rounds correctly for +, -, *, / and sqrt). Angles reported in the result are
// measured from the start position and unwrapped. Derivations: docs/PHYSICS.md.

export type Round = (x: number) => number;
export const f64: Round = (x) => x;
export const f32: Round = Math.fround;

export type Termination = 'escaped' | 'captured' | 'stepLimit';

export interface PlanarRayResult {
  readonly termination: Termination;
  /** Polar angle of the escape direction (escaped rays; NaN otherwise). */
  readonly escapeAngle: number;
  /** Polar angle of the last position reached. */
  readonly positionAngle: number;
  /** Radius of the last position reached; Infinity when the integrator reaches u = 0 exactly. */
  readonly finalRadius: number;
  readonly steps: number;
}

interface CommonOptions {
  readonly round: Round;
  readonly maxSteps: number;
  /** Diagnostic hook called with the state before every step. */
  readonly onStep?: (state: readonly number[]) => void;
}

export interface BinetOptions extends CommonOptions {
  /** Fixed step in the orbital angle phi, radians. */
  readonly dphi: number;
}

export interface CartesianOptions extends CommonOptions {
  /** Step length as a fraction of the current radius: |dx| = eta r. */
  readonly eta: number;
  /** Radius beyond which an outgoing ray counts as escaped. */
  readonly rEscape: number;
}

/** Below this |sin psi| a ray is treated as exactly radial, which is a straight line. */
export const RADIAL_SIN = 1e-7;

function radialRay(cosPsi: number, r0: number): PlanarRayResult {
  return cosPsi > 0
    ? { termination: 'escaped', escapeAngle: 0, positionAngle: 0, finalRadius: Infinity, steps: 0 }
    : { termination: 'captured', escapeAngle: NaN, positionAngle: 0, finalRadius: r0, steps: 0 };
}

/** A crossing of the line phi = firstCrossing + k pi in the ray plane, with u interpolated there. */
export interface PlaneCrossingSample {
  readonly phi: number;
  readonly u: number;
}

export interface BinetCoreOptions extends CommonOptions {
  readonly dphi: number;
  /** Capture threshold: stop when u exceeds it while moving inward. Exact for any u >= 1/(3M). */
  readonly uCapture: number;
  /**
   * First orbital angle, in (0, pi], at which the ray plane meets the disk plane; later crossings
   * follow every pi. Omit to skip crossing detection.
   */
  readonly firstCrossing?: number;
}

export interface BinetCoreResult {
  readonly termination: Termination;
  /** Orbital angle where u reaches 0 (escaped) or uCapture (captured); last angle otherwise. */
  readonly phiEnd: number;
  /** u at phiEnd. */
  readonly uEnd: number;
  readonly steps: number;
  /** Plane crossings before phiEnd, in order along the traced path. */
  readonly crossings: PlaneCrossingSample[];
}

/**
 * The chosen integrator (Stage 0): the orbit equation u'' + u = 3 M u^2 (u = 1/r, ' = d/dphi),
 * classical RK4 with a fixed step in phi, from u0 = 1/r0 and w0 = du/dphi. Escape is found exactly
 * at u = 0 and capture at u = uCapture by solving the cubic Hermite interpolant of the last step,
 * so no escape radius is needed. Because phi only increases, each disk-plane crossing angle is
 * met once, in order: none can be missed or counted twice.
 */
export function integrateBinet(
  M: number,
  u0: number,
  w0: number,
  opts: BinetCoreOptions,
): BinetCoreResult {
  const R = opts.round;
  const m3 = R(3 * M);
  const uCapture = R(opts.uCapture);
  const h = R(opts.dphi);
  const hHalf = R(h / 2);
  const hSixth = R(h / 6);
  const pi = R(Math.PI);
  const acc = (x: number) => R(R(m3 * R(x * x)) - x);
  const crossings: PlaneCrossingSample[] = [];
  let nextCrossing = opts.firstCrossing ?? Infinity;

  let u = u0;
  let w = w0;
  for (let n = 0; n < opts.maxSteps; n++) {
    opts.onStep?.([u, w]);
    const k1u = w;
    const k1w = acc(u);
    const k2u = R(w + R(hHalf * k1w));
    const k2w = acc(R(u + R(hHalf * k1u)));
    const k3u = R(w + R(hHalf * k2w));
    const k3w = acc(R(u + R(hHalf * k2u)));
    const k4u = R(w + R(h * k3w));
    const k4w = acc(R(u + R(h * k3u)));
    const uNext = R(u + R(hSixth * R(R(k1u + R(2 * k2u)) + R(R(2 * k3u) + k4u))));
    const wNext = R(w + R(hSixth * R(R(k1w + R(2 * k2w)) + R(R(2 * k3w) + k4w))));

    let termination: Termination | null = null;
    let t = 1;
    if (uNext <= 0) {
      termination = 'escaped';
      t = hermiteSolve(u, w, uNext, wNext, h, 0, R);
    } else if (uNext >= uCapture && wNext > 0) {
      termination = 'captured';
      t = hermiteSolve(u, w, uNext, wNext, h, uCapture, R);
    }
    const phiStart = R(n * h);
    const phiStop = termination ? R(phiStart + R(t * h)) : R((n + 1) * h);

    while (termination ? nextCrossing < phiStop : nextCrossing <= phiStop) {
      const tc = R(R(nextCrossing - phiStart) / h);
      const uc = hermiteValue(u, w, uNext, wNext, h, tc, R);
      if (uc > 0) crossings.push({ phi: nextCrossing, u: uc });
      nextCrossing = R(nextCrossing + pi);
    }

    if (termination) {
      const uEnd = termination === 'escaped' ? 0 : uCapture;
      return { termination, phiEnd: phiStop, uEnd, steps: n + 1, crossings };
    }
    u = uNext;
    w = wNext;
  }
  return {
    termination: 'stepLimit',
    phiEnd: R(opts.maxSteps * h),
    uEnd: u,
    steps: opts.maxSteps,
    crossings,
  };
}

/**
 * Candidate A of the spike, for a planar start: observer at r0 on the +x axis, local angle psi
 * from the outward radial. Capture at u > 1/(3M) while moving inward (exact for Schwarzschild).
 */
export function traceBinetRK4(
  M: number,
  r0: number,
  psi: number,
  opts: BinetOptions,
): PlanarRayResult {
  const R = opts.round;
  const sinPsi = R(Math.sin(psi));
  const cosPsi = R(Math.cos(psi));
  if (Math.abs(sinPsi) < RADIAL_SIN) return radialRay(cosPsi, r0);

  const u0 = R(1 / R(r0));
  // w = du/dphi = -u sqrt(1 - 2Mu) cot(psi)
  const w0 = R(-R(R(u0 * R(Math.sqrt(R(1 - R(R(2 * M) * u0))))) * R(cosPsi / sinPsi)));
  const core = integrateBinet(M, u0, w0, { ...opts, uCapture: 1 / (3 * M) });
  const escaped = core.termination === 'escaped';
  return {
    termination: core.termination,
    escapeAngle: escaped ? core.phiEnd : NaN,
    positionAngle: core.phiEnd,
    finalRadius: escaped ? Infinity : 1 / core.uEnd,
    steps: core.steps,
  };
}

/** Cubic Hermite interpolant of u over one step, at fraction t of the step. */
function hermiteValue(
  u0: number,
  w0: number,
  u1: number,
  w1: number,
  h: number,
  t: number,
  R: Round,
): number {
  const t2 = R(t * t);
  const t3 = R(t2 * t);
  const h00 = R(R(R(2 * t3) - R(3 * t2)) + 1);
  const h10 = R(R(t3 - R(2 * t2)) + t);
  const h01 = R(R(3 * t2) - R(2 * t3));
  const h11 = R(t3 - t2);
  return R(R(R(h00 * u0) + R(h10 * R(h * w0))) + R(R(h01 * u1) + R(h11 * R(h * w1))));
}

/**
 * Fraction t in [0, 1] of the step where the Hermite interpolant of u equals `target`, which lies
 * between u0 and u1: Newton iteration from the linear guess, falling back to bisection whenever a
 * Newton step leaves the bracket.
 */
function hermiteSolve(
  u0: number,
  w0: number,
  u1: number,
  w1: number,
  h: number,
  target: number,
  R: Round,
): number {
  const m0 = R(h * w0);
  const m1 = R(h * w1);
  const rising = u1 > u0;
  let lo = 0;
  let hi = 1;
  let t = R(R(u0 - target) / R(u0 - u1));
  for (let i = 0; i < 8; i++) {
    const t2 = R(t * t);
    const value = R(hermiteValue(u0, w0, u1, w1, h, t, R) - target);
    if (value === 0) break;
    if (value < 0 === rising) lo = t;
    else hi = t;
    const d00 = R(R(6 * t2) - R(6 * t));
    const d10 = R(R(R(3 * t2) - R(4 * t)) + 1);
    const d01 = R(R(6 * t) - R(6 * t2));
    const d11 = R(R(3 * t2) - R(2 * t));
    const slope = R(R(R(d00 * u0) + R(d10 * m0)) + R(R(d01 * u1) + R(d11 * m1)));
    const next = R(t - R(value / slope));
    // Converged: further iterations would only chase rounding noise out of the bracket.
    if (Math.abs(next - t) <= 1e-6) {
      t = next;
      break;
    }
    t = next >= lo && next <= hi ? next : R(R(lo + hi) / 2);
  }
  return Math.min(1, Math.max(0, t));
}

interface CartesianSetup {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 3 M h^2, the force constant: x'' = -k x / r^5 */
  k: number;
}

function cartesianStart(M: number, r0: number, psi: number, R: Round): CartesianSetup {
  const sinPsi = R(Math.sin(psi));
  const cosPsi = R(Math.cos(psi));
  const x = R(r0);
  // Local direction (cos psi, sin psi) -> Euclidean velocity: radial part scaled by sqrt(1 - 2M/r).
  const vx = R(R(Math.sqrt(R(1 - R(R(2 * M) / x)))) * cosPsi);
  const vy = sinPsi;
  const hc = R(x * vy);
  return { x, y: 0, vx, vy, k: R(R(3 * M) * R(hc * hc)) };
}

function cartesianResult(
  termination: Termination,
  angle: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  steps: number,
): PlanarRayResult {
  const escapeAngle =
    termination === 'escaped' ? angle + Math.atan2(x * vy - y * vx, x * vx + y * vy) : NaN;
  return { termination, escapeAngle, positionAngle: angle, finalRadius: Math.hypot(x, y), steps };
}

/**
 * Candidate B: x'' = -3 M h^2 x / r^5 with classical RK4 and step length eta r. The escape
 * direction is the velocity direction when r first exceeds rEscape on an outgoing path.
 */
export function traceCartesianRK4(
  M: number,
  r0: number,
  psi: number,
  opts: CartesianOptions,
): PlanarRayResult {
  const R = opts.round;
  let { x, y, vx, vy } = cartesianStart(M, r0, psi, R);
  const { k } = cartesianStart(M, r0, psi, R);
  const eta = R(opts.eta);
  const rCapture = R(3 * M);
  const rEscape = R(opts.rEscape);
  // Force factor s with a = s x, s = -k / r^5.
  const force = (px: number, py: number) => {
    const r2 = R(R(px * px) + R(py * py));
    return R(-R(k / R(R(r2 * r2) * R(Math.sqrt(r2)))));
  };

  let angle = 0; // unwrapped polar angle of the position (f64 diagnostic, not part of the model)
  for (let n = 0; n < opts.maxSteps; n++) {
    opts.onStep?.([x, y, vx, vy]);
    const r = R(Math.sqrt(R(R(x * x) + R(y * y))));
    const speed = R(Math.sqrt(R(R(vx * vx) + R(vy * vy))));
    const dl = R(R(eta * r) / speed);
    const half = R(dl / 2);
    const sixth = R(dl / 6);

    const s1 = force(x, y);
    const a1x = R(s1 * x);
    const a1y = R(s1 * y);
    const x2 = R(x + R(half * vx));
    const y2 = R(y + R(half * vy));
    const v2x = R(vx + R(half * a1x));
    const v2y = R(vy + R(half * a1y));
    const s2 = force(x2, y2);
    const a2x = R(s2 * x2);
    const a2y = R(s2 * y2);
    const x3 = R(x + R(half * v2x));
    const y3 = R(y + R(half * v2y));
    const v3x = R(vx + R(half * a2x));
    const v3y = R(vy + R(half * a2y));
    const s3 = force(x3, y3);
    const a3x = R(s3 * x3);
    const a3y = R(s3 * y3);
    const x4 = R(x + R(dl * v3x));
    const y4 = R(y + R(dl * v3y));
    const v4x = R(vx + R(dl * a3x));
    const v4y = R(vy + R(dl * a3y));
    const s4 = force(x4, y4);
    const a4x = R(s4 * x4);
    const a4y = R(s4 * y4);

    const xN = R(x + R(sixth * R(R(vx + R(2 * v2x)) + R(R(2 * v3x) + v4x))));
    const yN = R(y + R(sixth * R(R(vy + R(2 * v2y)) + R(R(2 * v3y) + v4y))));
    const vxN = R(vx + R(sixth * R(R(a1x + R(2 * a2x)) + R(R(2 * a3x) + a4x))));
    const vyN = R(vy + R(sixth * R(R(a1y + R(2 * a2y)) + R(R(2 * a3y) + a4y))));

    angle += Math.atan2(x * yN - y * xN, x * xN + y * yN);
    x = xN;
    y = yN;
    vx = vxN;
    vy = vyN;
    const rN = R(Math.sqrt(R(R(x * x) + R(y * y))));
    const outgoing = R(R(x * vx) + R(y * vy)) > 0;
    if (rN >= rEscape && outgoing) return cartesianResult('escaped', angle, x, y, vx, vy, n + 1);
    if (rN <= rCapture && !outgoing) return cartesianResult('captured', angle, x, y, vx, vy, n + 1);
  }
  return cartesianResult('stepLimit', angle, x, y, vx, vy, opts.maxSteps);
}

/**
 * Candidate C: the same equation with kick-drift-kick leapfrog (second order). With a central
 * force both kick and drift preserve h = x cross v exactly, even with a variable step.
 */
export function traceCartesianLeapfrog(
  M: number,
  r0: number,
  psi: number,
  opts: CartesianOptions,
): PlanarRayResult {
  const R = opts.round;
  let { x, y, vx, vy } = cartesianStart(M, r0, psi, R);
  const { k } = cartesianStart(M, r0, psi, R);
  const eta = R(opts.eta);
  const rCapture = R(3 * M);
  const rEscape = R(opts.rEscape);
  const force = (px: number, py: number) => {
    const r2 = R(R(px * px) + R(py * py));
    return R(-R(k / R(R(r2 * r2) * R(Math.sqrt(r2)))));
  };

  let angle = 0;
  for (let n = 0; n < opts.maxSteps; n++) {
    opts.onStep?.([x, y, vx, vy]);
    const r = R(Math.sqrt(R(R(x * x) + R(y * y))));
    const speed = R(Math.sqrt(R(R(vx * vx) + R(vy * vy))));
    const dl = R(R(eta * r) / speed);
    const half = R(dl / 2);

    const s1 = R(half * force(x, y));
    vx = R(vx + R(s1 * x));
    vy = R(vy + R(s1 * y));
    const xN = R(x + R(dl * vx));
    const yN = R(y + R(dl * vy));
    const s2 = R(half * force(xN, yN));
    vx = R(vx + R(s2 * xN));
    vy = R(vy + R(s2 * yN));

    angle += Math.atan2(x * yN - y * xN, x * xN + y * yN);
    x = xN;
    y = yN;
    const rN = R(Math.sqrt(R(R(x * x) + R(y * y))));
    const outgoing = R(R(x * vx) + R(y * vy)) > 0;
    if (rN >= rEscape && outgoing) return cartesianResult('escaped', angle, x, y, vx, vy, n + 1);
    if (rN <= rCapture && !outgoing) return cartesianResult('captured', angle, x, y, vx, vy, n + 1);
  }
  return cartesianResult('stepLimit', angle, x, y, vx, vy, opts.maxSteps);
}
