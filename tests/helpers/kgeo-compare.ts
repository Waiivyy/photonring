// photonring against kgeo's output numbers (tests/data/kgeo-bc5affe.json), spin 0: the screen
// mapping, photonring's side of each comparison, and the derived tolerances. kgeo itself was run
// from a separate Python driver outside photonring's build and tests; no kgeo code is here.
//
// Tolerances (relative unless stated). Each term is a bound on one source of difference:
//  - kgeo's own error: per sample, measured against kgeo's ODE oracle (tests/geodesic_ode.py at the
//    same commit) and stored in the fixture as rsErr: |r_kgeo / r_oracle - 1| plus the oracle's
//    change between two tolerances, rounded up.
//  - photonring's truncation error: step halving (d phi = 5e-4 and 2.5e-4), |r_h - r_h/2| / 15
//    for the finer step, doubled.
//  - photonring's rounding error. Below d phi of about 1e-3 the rounding accumulated over the
//    1e4 to 1e5 steps of a ray exceeds the truncation error and does not shrink with the step, so
//    step halving cannot see it. It shows up as a drift of the orbit's conserved quantity,
//    1/b^2 = w^2 + u^2 - 2 u^3 (w = du/dphi), which the helper measures along the traced ray. Near
//    the critical curve the radius at a crossing depends on the ray through b (through eps), so a
//    drift d of b moves ln r by about d (1 + (b/b_c) |d ln r / d ln |eps|| / |eps|). The term is
//    that, with d the largest drift up to the crossing, doubled. The factor 2 is a choice, as for
//    step halving: on two rays near b_c examined against kgeo's ODE oracle at steps from 6e-5 to
//    1e-3, the undoubled slope part was 1.2 to 3.4 times the error seen at orders 1 to 4.
//    A wrong force law also breaks the conservation, and would widen this term with the error under
//    test, so d enters capped at the rounding model DRIFT_MODEL 2^-53 sqrt(steps), and K1 asserts
//    separately that d stays under that cap (driftBound).
//  - the input: both codes start from the same (alpha, beta) but carry the impact parameter with
//    different rounding. photonring's ray is a unit direction vector whose transverse part is only
//    sin(psi) = k b (5.2e-3 for b = b_c at 1000 M), so its rounding of b can reach the order of
//    2^-53 / sin(psi) relative (2.1e-14 there); the helper measures it per ray from traceRay's
//    impactParameter. kgeo forms lambda, eta and their
//    sum (8 ulp allowed). A relative change d of b moves eps = b/b_c - 1 by d (b/b_c)/|eps|, and the
//    radius by that times |d ln r / d ln |eps||, which photonring supplies by a finite difference.
//    The same small transverse vector fixes traceRay's ray plane, so its first crossing angle
//    differs from the one (alpha, beta) give directly; the helper measures the difference, adds 8
//    ulp of the sweep for both codes' rounding, and converts it with d ln r / d phi = |w| / u at the
//    crossing (exact along the ray).
//  - the final rounding of the compared numbers: 4 ulp.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  cameraFrame,
  circularOrbitEmitter,
  criticalImpactParameter,
  f64,
  firstPlaneCrossingAngle,
  integrate,
  integrateBinet,
  orbitRoots,
  outboundSweep,
  redshiftFactor,
  ringFoldSweep,
  ringImageOffset,
  subringOffset,
  sweptAnglePlunging,
  sweptAngleQuadrature,
  traceRay,
  type Termination,
  type Vec3,
} from '../../src/physics/index.ts';

export const KGEO_FIXTURE_PATH = fileURLToPath(
  new URL('../data/kgeo-bc5affe.json', import.meta.url),
);

const BC = criticalImpactParameter(1);
const ULP = Number.EPSILON; // 2^-52
/** Step of photonring's ray integration, and its half for the step-halving estimate. */
export const DPHI = 5e-4;
/** photonring's capture radius in the comparison: (2M, 3M] allowed; the default 3M drops crossings. */
export const CAPTURE_RADIUS = 2.001;
/** Rays with a crossing nearer than this to an end of the ray (in sweep, rad) are not counted. */
export const END_MARGIN = 1e-9;
/**
 * Factor of the rounding model for the drift d of b: a random walk of about one unit roundoff per
 * step, d <= DRIFT_MODEL 2^-53 sqrt(steps). The 2 is a choice, set from the worst measured over all
 * 10,368 driver rays (1.24 at r_o = 100 M, 1.38 at 1000 M, both at the first crossing; 0.90 in the
 * fixture). A force-law coefficient off by 1e-12 gives 192 (measured on a changed copy).
 */
export const DRIFT_MODEL = 2;

/** The rounding model's bound on the drift of b after the given number of steps. */
export function driftBound(steps: number): number {
  return DRIFT_MODEL * 2 ** -53 * Math.sqrt(steps);
}
/** Step in ln|eps| of the finite difference for d ln r / d ln |eps|. */
const SLOPE_STEP = 1e-3;
const MAX_STEPS = 1_000_000;

export interface KgeoRay {
  readonly ro: number;
  readonly thetaDeg: number;
  readonly angleDeg: number;
  readonly set: string;
  readonly alpha: number;
  readonly beta: number;
  /** kgeo's Nmax: its last crossing is mbar = nmax. */
  readonly nmax: number;
  readonly outside: boolean;
  /** kgeo's r_s for mbar = 0 to nmax + 1 (the last is kgeo's 0 for "no such crossing"). */
  readonly rs: readonly number[];
  /** Measured bound on kgeo's relative error of rs[mbar], mbar = 0 to nmax. */
  readonly rsErr: readonly number[];
  /** kgeo's Iobs g with Velocity('kep') for mbar = 0, 1 (0 where it masks the pixel). */
  readonly g: readonly [number, number];
  /** kgeo's ODE oracle radii and their error bounds where kgeo is outside its accurate range. */
  readonly oracle: { readonly rs: readonly number[]; readonly err: readonly number[] } | null;
}

export interface KgeoRing {
  readonly ro: number;
  readonly thetaDeg: number;
  readonly angleDeg: number;
  readonly n: number;
  readonly R: number;
  /** kgeo's Brent root of r_s(b) = R along the image angle, as (alpha, beta). */
  readonly alpha: number;
  readonly beta: number;
  /** Measured bound on kgeo's relative error of r_s at that root. */
  readonly rsErr: number;
}

export interface KgeoFixture {
  readonly source: {
    readonly code: string;
    readonly commit: string;
    readonly licence: string;
    readonly note: string;
  };
  readonly produced: {
    readonly machine: string;
    readonly commands: readonly string[];
    readonly packages: Readonly<Record<string, string>>;
  };
  readonly oracle: { readonly sha256: string };
  /** kgeo's region III is unreliable for b_c - b below this fraction of b_c. */
  readonly kgeoInsideUnreliable: number;
  readonly rays: readonly KgeoRay[];
  readonly rings: readonly KgeoRing[];
  readonly velocity: readonly { readonly r: number; readonly ut: number; readonly uphi: number }[];
  readonly sizeBytes: number;
  readonly text: string;
}

const RAY_FIELDS = 'ro,thetaDeg,angleDeg,set,alpha,beta,nmax,outside,rs,rsErr,g,oracle';
const RING_FIELDS = 'ro,thetaDeg,angleDeg,n,R,alpha,beta,rsErr';

type Row = readonly unknown[];
const num = (x: unknown): number => {
  if (typeof x !== 'number') throw new TypeError(`fixture: expected a number, got ${String(x)}`);
  return x;
};
const nums = (x: unknown): number[] => {
  if (!Array.isArray(x)) throw new TypeError('fixture: expected an array');
  return x.map(num);
};

export function loadKgeoFixture(): KgeoFixture {
  const text = readFileSync(KGEO_FIXTURE_PATH, 'utf8');
  const raw = JSON.parse(text) as {
    source: KgeoFixture['source'];
    produced: KgeoFixture['produced'];
    oracle: KgeoFixture['oracle'];
    kgeoInsideUnreliable: number;
    rayFields: string[];
    rays: Row[];
    ringFields: string[];
    rings: Row[];
    velocityFields: string[];
    velocity: Row[];
  };
  if (raw.rayFields.join(',') !== RAY_FIELDS) throw new Error('fixture: unexpected ray fields');
  if (raw.ringFields.join(',') !== RING_FIELDS) throw new Error('fixture: unexpected ring fields');
  if (raw.velocityFields.join(',') !== 'r,ut,uphi') throw new Error('fixture: velocity fields');
  const rays = raw.rays.map((r): KgeoRay => {
    const oracle = r[11] as [unknown, unknown] | null;
    const g = nums(r[10]);
    return {
      ro: num(r[0]),
      thetaDeg: num(r[1]),
      angleDeg: num(r[2]),
      set: String(r[3]),
      alpha: num(r[4]),
      beta: num(r[5]),
      nmax: num(r[6]),
      outside: num(r[7]) === 1,
      rs: nums(r[8]),
      rsErr: nums(r[9]),
      g: [g[0]!, g[1]!],
      oracle: oracle ? { rs: nums(oracle[0]), err: nums(oracle[1]) } : null,
    };
  });
  const rings = raw.rings.map((r): KgeoRing => ({
    ro: num(r[0]),
    thetaDeg: num(r[1]),
    angleDeg: num(r[2]),
    n: num(r[3]),
    R: num(r[4]),
    alpha: num(r[5]),
    beta: num(r[6]),
    rsErr: num(r[7]),
  }));
  return {
    source: raw.source,
    produced: raw.produced,
    oracle: raw.oracle,
    kgeoInsideUnreliable: raw.kgeoInsideUnreliable,
    rays,
    rings,
    velocity: raw.velocity.map((v) => ({ r: num(v[0]), ut: num(v[1]), uphi: num(v[2]) })),
    sizeBytes: Buffer.byteLength(text),
    text,
  };
}

/**
 * How kgeo's screen (alpha, beta) is placed on photonring's: 'kgeo' is the derived mapping
 * (alpha to image right, beta to image up); the mirrored ones exist so the pinning tests can show
 * that the data tell them apart.
 */
export type ScreenMapping = 'kgeo' | 'mirrorAlpha' | 'mirrorBeta';

export interface ScreenRay {
  readonly origin: Vec3;
  readonly direction: Vec3;
  /** First disk-plane crossing angle of the ray plane (firstPlaneCrossingAngle). */
  readonly phi0: number;
  /** hypot(alpha, beta): the impact parameter both codes are given. */
  readonly bExact: number;
}

/**
 * photonring's ray for kgeo's screen point (alpha, beta) of an observer at r_o and inclination
 * theta_o: the static observer at azimuth 0 and elevation 90 - theta_o, looking along
 * sqrt(1 - k^2 b^2) forward + k alpha right + k beta up, k = sqrt(1 - 2/r_o) / r_o. For spin 0,
 * with lambda = -alpha sin(theta_o) and eta = alpha^2 cos^2(theta_o) + beta^2, the photon's
 * momentum in the static observer's frame has p^(phi) = lambda / (r_o sin(theta_o)) = -alpha / r_o
 * and p^(theta) = beta / r_o (beta > 0 when the backward ray first heads for the pole, which kgeo's
 * crossing count assumes), with energy 1 / sqrt(1 - 2/r_o): so the observer sees the photon
 * arrive from the direction above, at sin(psi) = k b (docs/PHYSICS.md, section 6). Image right is
 * +phi at azimuth 0, image up is -theta.
 */
export function screenRay(
  rObs: number,
  thetaDeg: number,
  alpha: number,
  beta: number,
  mapping: ScreenMapping = 'kgeo',
): ScreenRay {
  const f = cameraFrame({
    distance: rObs,
    azimuthDeg: 0,
    elevationDeg: 90 - thetaDeg,
    fovYDeg: 60,
  });
  const a = mapping === 'mirrorAlpha' ? -alpha : alpha;
  const b = mapping === 'mirrorBeta' ? -beta : beta;
  const k = Math.sqrt(1 - 2 / rObs) / rObs;
  const x = k * a;
  const y = k * b;
  const c = Math.sqrt(1 - x * x - y * y);
  const v = [0, 1, 2].map((i) => c * f.forward[i]! + x * f.right[i]! + y * f.up[i]!);
  const n = Math.hypot(v[0]!, v[1]!, v[2]!);
  const bExact = Math.hypot(a, b);
  const e2z = (a * f.right[2] + b * f.up[2]) / bExact;
  const phi0 = firstPlaneCrossingAngle(f.position[2] / rObs, e2z);
  if (phi0 === undefined) throw new Error('ray plane is the disk plane');
  return {
    origin: f.position,
    direction: [v[0]! / n, v[1]! / n, v[2]! / n],
    phi0,
    bExact,
  };
}

export interface PhotonringRay {
  /** Impact parameter of the traced ray (traceRay's impactParameter). */
  readonly b: number;
  readonly bExact: number;
  readonly phi0: number;
  readonly termination: Termination;
  readonly lzOverE: number;
  /** Radii of the crossings while r < r_o (kgeo stops counting at r_o), at d phi / 2. */
  readonly radii: readonly number[];
  /** Step-halving estimate of the RK4 truncation error of each radius, relative, doubled. */
  readonly rk4: readonly number[];
  /** Largest relative drift of b (from the conserved 1/b^2) up to each crossing, at d phi / 2. */
  readonly drift: readonly number[];
  /** Number of d phi / 2 steps behind each drift value. */
  readonly steps: readonly number[];
  /**
   * Error in sweep of each crossing from the input: traceRay's first crossing angle (from its
   * ray-plane basis, a small transverse vector at large r_o) against the one from (alpha, beta)
   * directly, plus 8 ulp of the sweep for both codes' rounding of it.
   */
  readonly phaseErr: readonly number[];
  /** |d ln r / d phi| at each crossing. */
  readonly dLnRdPhi: readonly number[];
  /** |d ln r / d ln |eps|| of each crossing; Infinity where a neighbour lacks the crossing. */
  readonly slope: readonly number[];
  /** Smallest distance in sweep (rad) from a crossing to an end of the ray, in either code. */
  readonly endMargin: number;
}

interface Traced {
  readonly screen: ScreenRay;
  readonly b: number;
  readonly termination: Termination;
  readonly lzOverE: number;
  readonly radii: number[];
  /** Every crossing radius, also those beyond r_o. */
  readonly all: number[];
}

function trace(
  rObs: number,
  thetaDeg: number,
  alpha: number,
  beta: number,
  mapping: ScreenMapping,
  dphi: number,
  captureRadius: number,
): Traced {
  const screen = screenRay(rObs, thetaDeg, alpha, beta, mapping);
  const res = traceRay(1, screen.origin, screen.direction, {
    dphi,
    maxSteps: MAX_STEPS,
    captureRadius,
  });
  if (res.termination === 'stepLimit') throw new Error('traceRay reached its step limit');
  const radii: number[] = [];
  for (const c of res.crossings) {
    if (!(c.radius < rObs)) break;
    radii.push(c.radius);
  }
  return {
    screen,
    b: res.impactParameter,
    termination: res.termination,
    lzOverE: res.lzOverE,
    radii,
    all: res.crossings.map((c) => c.radius),
  };
}

/**
 * Largest relative drift of b = 1/sqrt(w^2 + u^2 - 2 u^3) from its starting value, up to each
 * crossing of the traced ray. The orbit is integrated again with integrateBinet from the initial
 * state traceRay computes (same formulas), and its crossings must equal traceRay's bit for bit, so
 * the drift belongs to the ray that was compared.
 */
interface DriftResult {
  /** Largest relative drift of b up to each crossing. */
  readonly drift: number[];
  /** The first crossing angle traceRay derives from its own ray-plane basis. */
  readonly phi0: number;
  /** |d ln r / d phi| = |w| / u at each crossing. */
  readonly dLnRdPhi: number[];
  /** Number of steps whose drift is included in each crossing's value. */
  readonly steps: number[];
}

function invariantDrift(t: Traced, dphi: number, captureRadius: number): DriftResult {
  const { origin, direction: d } = t.screen;
  const r0 = Math.hypot(origin[0], origin[1], origin[2]);
  const e1 = [origin[0] / r0, origin[1] / r0, origin[2] / r0] as const;
  const cosPsi = d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2];
  const tv = [d[0] - cosPsi * e1[0], d[1] - cosPsi * e1[1], d[2] - cosPsi * e1[2]] as const;
  const sinPsi = Math.hypot(tv[0], tv[1], tv[2]);
  const u0 = 1 / r0;
  const w0 = -u0 * Math.sqrt(1 - 2 * u0) * (cosPsi / sinPsi);
  const firstCrossing = firstPlaneCrossingAngle(e1[2], tv[2] / sinPsi);
  if (firstCrossing === undefined) throw new Error('ray plane is the disk plane');
  const bOf = (u: number, w: number) => 1 / Math.sqrt(w * w + u * u - 2 * u * u * u);
  const b0 = bOf(u0, w0);
  const running: number[] = [];
  let worst = 0;
  const res = integrateBinet(1, u0, w0, {
    round: f64,
    dphi,
    maxSteps: MAX_STEPS,
    uCapture: 1 / captureRadius,
    firstCrossing,
    onStep: (y) => {
      worst = Math.max(worst, Math.abs(bOf(y[0]!, y[1]!) / b0 - 1));
      running.push(worst);
    },
  });
  if (res.crossings.length !== t.all.length || res.crossings.some((c, m) => 1 / c.u !== t.all[m])) {
    throw new Error('the drift integration does not reproduce traceRay');
  }
  // crossing m lies in the step that starts at floor(phi / dphi); the state after it is the next
  const index = res.crossings.map((c) =>
    Math.min(running.length - 1, Math.floor(c.phi / dphi) + 1),
  );
  const drift = index.map((i) => running[i]!);
  const steps = index.map((i) => i + 1);
  const dLnRdPhi = res.crossings.map(
    (c) => Math.sqrt(Math.max(0, 1 / (b0 * b0) - c.u * c.u + 2 * c.u * c.u * c.u)) / c.u,
  );
  return { drift, phi0: firstCrossing, dLnRdPhi, steps };
}

/** Sweeps at which the ray ends in photonring (escape, capture) and in kgeo (r_o, horizon). */
function endSweeps(b: number, rObs: number, captureRadius: number): number[] {
  const uo = 1 / rObs;
  if (b > BC) return [outboundSweep(b, uo, 0), outboundSweep(b, uo, uo)];
  return [sweptAnglePlunging(b, uo, 1 / captureRadius, 1), sweptAnglePlunging(b, uo, 0.5, 1)];
}

export interface RayOptions {
  readonly mapping?: ScreenMapping;
  readonly captureRadius?: number;
}

/**
 * photonring's crossings for kgeo's screen point: traceRay at d phi and d phi / 2 (the RK4
 * estimate) and at eps e^(+-SLOPE_STEP) (the slope), with capture at CAPTURE_RADIUS, and the drift
 * of the conserved quantity along the d phi / 2 ray (the rounding estimate).
 */
export function photonringRay(
  ray: {
    readonly ro: number;
    readonly thetaDeg: number;
    readonly alpha: number;
    readonly beta: number;
  },
  opts: RayOptions = {},
): PhotonringRay {
  const mapping = opts.mapping ?? 'kgeo';
  const capture = opts.captureRadius ?? CAPTURE_RADIUS;
  const { ro, thetaDeg, alpha, beta } = ray;
  const coarse = trace(ro, thetaDeg, alpha, beta, mapping, DPHI, capture);
  const fine = trace(ro, thetaDeg, alpha, beta, mapping, DPHI / 2, capture);
  const bExact = coarse.screen.bExact;
  const eps = bExact / BC - 1;
  const side = [1, -1].map((s) => {
    const scale = (BC * (1 + eps * Math.exp(s * SLOPE_STEP))) / bExact;
    return trace(ro, thetaDeg, alpha * scale, beta * scale, mapping, DPHI, capture);
  });
  const [plus, minus] = side as [Traced, Traced];
  const dLnEps = Math.abs(Math.log((plus.b / BC - 1) / (minus.b / BC - 1)));
  const inv = invariantDrift(fine, DPHI / 2, capture);
  const drift = inv.drift.slice(0, fine.radii.length);
  const steps = inv.steps.slice(0, fine.radii.length);
  const dLnRdPhi = inv.dLnRdPhi.slice(0, fine.radii.length);
  const phaseErr = fine.radii.map(
    (_, m) =>
      Math.abs(inv.phi0 - fine.screen.phi0) + 8 * (ULP / 2) * (fine.screen.phi0 + m * Math.PI),
  );
  const rk4 = fine.radii.map((r, m) => {
    const rc = coarse.radii[m];
    return rc === undefined ? Infinity : (2 * Math.abs(rc - r)) / (15 * r);
  });
  const slope = fine.radii.map((_, m) => {
    const rp = plus.radii[m];
    const rm = minus.radii[m];
    return rp === undefined || rm === undefined ? Infinity : Math.abs(Math.log(rp / rm)) / dLnEps;
  });
  const ends = endSweeps(fine.b, ro, capture);
  const last = Math.max(...ends) + Math.PI;
  let endMargin = Infinity;
  for (let k = 0; fine.screen.phi0 + k * Math.PI <= last; k++) {
    for (const e of ends)
      endMargin = Math.min(endMargin, Math.abs(fine.screen.phi0 + k * Math.PI - e));
  }
  if (coarse.radii.length !== fine.radii.length) endMargin = 0;
  return {
    b: fine.b,
    bExact,
    phi0: fine.screen.phi0,
    termination: fine.termination,
    lzOverE: fine.lzOverE,
    radii: fine.radii,
    rk4,
    drift,
    steps,
    phaseErr,
    dLnRdPhi,
    slope,
    endMargin,
  };
}

/** The input term: relative change of eps from the two codes' rounding of b. */
function inputEps(p: PhotonringRay): number {
  const eps = p.bExact / BC - 1;
  return ((Math.abs(p.b / p.bExact - 1) + 8 * (ULP / 2)) * (p.bExact / BC)) / Math.abs(eps);
}

export interface Comparison {
  /** kgeo's order mbar. */
  readonly n: number;
  readonly rel: number;
  readonly tol: number;
}

/**
 * K1: kgeo's r_s for mbar = n against photonring's crossing n + offset (offset 0 is the derived
 * convention; +-1 are for the pinning test). Where kgeo is outside its accurate range the
 * reference is the oracle's radius with its own error.
 */
export function radiusComparisons(ray: KgeoRay, p: PhotonringRay, offset = 0): Comparison[] {
  const ref = ray.oracle ? ray.oracle.rs : ray.rs;
  const err = ray.oracle ? ray.oracle.err : ray.rsErr;
  const out: Comparison[] = [];
  for (let m = 0; m <= ray.nmax; m++) {
    const j = m + offset;
    const rp = p.radii[j];
    if (rp === undefined) {
      // photonring captures at CAPTURE_RADIUS, so a reference crossing between the horizon and
      // that radius has no counterpart; K4 leaves it out the same way.
      if (offset === 0 && ref[m]! > CAPTURE_RADIUS && p.endMargin >= END_MARGIN)
        out.push({ n: m, rel: Infinity, tol: 0 });
      continue;
    }
    const amplify = (p.slope[j]! * (p.bExact / BC)) / Math.abs(p.bExact / BC - 1);
    const rounding = 2 * Math.min(p.drift[j]!, driftBound(p.steps[j]!)) * (1 + amplify);
    const phase = p.dLnRdPhi[j]! * p.phaseErr[j]!;
    const tol = err[m]! + p.rk4[j]! + rounding + p.slope[j]! * inputEps(p) + phase + 4 * ULP;
    out.push({ n: m, rel: Math.abs(rp / ref[m]! - 1), tol });
  }
  return out;
}

export interface CountComparison {
  readonly kgeo: number;
  readonly photonring: number;
  readonly margin: number;
  readonly decidable: boolean;
}

/**
 * K4: kgeo's Nmax + 1 crossings (to the horizon, or to r_o on the way out), less any it finds
 * between the horizon and photonring's capture radius, against photonring's crossings inside r_o.
 * Rays with a crossing within END_MARGIN of an end are not decidable.
 */
export function countComparison(ray: KgeoRay, p: PhotonringRay): CountComparison {
  const ref = ray.oracle ? ray.oracle.rs : ray.rs;
  let kgeo = 0;
  for (let m = 0; m <= ray.nmax; m++) if (ref[m]! > CAPTURE_RADIUS) kgeo++;
  return {
    kgeo,
    photonring: p.radii.length,
    margin: p.endMargin,
    decidable: p.endMargin >= END_MARGIN,
  };
}

export interface RingComparison {
  readonly rel: number;
  readonly tol: number;
  /** photonring's offset eps of the image. */
  readonly eps: number;
  readonly epsKgeo: number;
  /** Within 0.05 rad of the fold sweep, where eps is ill-conditioned in R (not compared). */
  readonly nearFold: boolean;
}

/**
 * K2: photonring's ring-image offset (subringOffset for the sweep phi0 + n pi, through
 * ringImageOffset) against eps of kgeo's root b. Tolerance, relative in eps:
 *  - kgeo's r_s error at its root (measured, rsErr) moves eps by |d ln eps / d ln R| times it;
 *  - kgeo's root is found to |db| <= 1e-15 + 4 ulp b (scipy brentq xtol, rtol);
 *  - rounding of b in both codes: 8 ulp of b, times (b/b_c)/|eps|;
 *  - photonring's solver: a sweep residual of 1e-12 rad, times |d ln eps / d sweep|. The bound is
 *    the one tests/unit/subrings.test.ts validates at 30 M; tests/unit/cross-check.test.ts checks
 *    it on these images too (sweepResidual), outbound and inbound, at 100 and 1000 M.
 *    The slopes are photonring's own, by finite differences.
 */
export function ringComparison(ring: KgeoRing, mapping: ScreenMapping = 'kgeo'): RingComparison {
  const { ro, R, n } = ring;
  const screen = screenRay(ro, ring.thetaDeg, ring.alpha, ring.beta, mapping);
  const b = Math.hypot(ring.alpha, ring.beta);
  const epsKgeo = b / BC - 1;
  const sweep = screen.phi0 + n * Math.PI;
  const fold = ringFoldSweep(ro, R);
  const nearFold = fold !== null && Math.abs(sweep - fold) < 0.05;
  const eps = subringOffset(ro, R, n, screen.phi0);
  const h = 1e-6;
  const lnEps = (r: number, s: number) => Math.log(Math.abs(ringImageOffset(ro, r, s)));
  const slopeR = Math.abs(lnEps(R * (1 + h), sweep) - lnEps(R * (1 - h), sweep)) / (2 * h);
  const slopeSweep = Math.abs(lnEps(R, sweep + h) - lnEps(R, sweep - h)) / (2 * h);
  const tol =
    slopeR * (ring.rsErr + 4 * ULP) +
    (1e-15 + 4 * ULP * b) / (BC * Math.abs(epsKgeo)) +
    (8 * ULP * (b / BC)) / Math.abs(epsKgeo) +
    1e-12 * slopeSweep;
  return { rel: Math.abs(eps / epsKgeo - 1), tol, eps, epsKgeo, nearFold };
}

export interface SweepResidual {
  /** Quadrature sweep at photonring's root minus the image's sweep, rad. */
  readonly residual: number;
  /** 1e-12 rad plus the resolution of eps in f64, as in tests/unit/subrings.test.ts. */
  readonly tol: number;
  /** The image ray reaches R before it turns (ringImageAngle's branch). */
  readonly inbound: boolean;
}

/**
 * The basis of K2's solver term: photonring's root eps for the image, put back into an
 * independent Gauss-Legendre quadrature of du / sqrt(P(u)), P = 1/b^2 - u^2 + 2u^3, b = b_c (1 + eps).
 * Outbound images (past the sweep of the ray that turns at R) use sweptAngleQuadrature on each leg
 * to the turning point, as tests/unit/subrings.test.ts does; inbound ones integrate from u_o to
 * u_R directly (4000 panels; P has no root between them).
 */
export function sweepResidual(ring: KgeoRing): SweepResidual {
  const { ro, R, n } = ring;
  const screen = screenRay(ro, ring.thetaDeg, ring.alpha, ring.beta, 'kgeo');
  const sweep = screen.phi0 + n * Math.PI;
  const eps = subringOffset(ro, R, n, screen.phi0);
  const b = BC * (1 + eps);
  const uo = 1 / ro;
  const uR = 1 / R;
  if (!(uo < uR)) throw new Error('sweepResidual needs the observer outside the ring');
  const threshold = outboundSweep(1 / (uR * Math.sqrt(1 - 2 * uR)), uo, uR);
  const inbound = !(sweep > threshold);
  let quad: number;
  if (inbound) {
    quad = integrate((u) => 1 / Math.sqrt(1 / (b * b) - u * u + 2 * u * u * u), uo, uR, 4000);
  } else {
    const { u2 } = orbitRoots(b, 1);
    const leg = (u: number) => (u2 > u ? sweptAngleQuadrature(b, u, u2, 1) : 0);
    quad = leg(uo) + leg(uR);
  }
  return { residual: quad - sweep, tol: 1e-12 + Number.EPSILON / Math.abs(eps), inbound };
}

/**
 * K3: photonring's g = redshiftFactor(circularOrbitEmitter(r), L_z/E) at its own crossing radius,
 * against kgeo's Iobs g, for mbar = 0, 1 where 6 <= r_s <= 20 (Keplerian, outside the ISCO; the
 * observer at infinity in both). Tolerance: |d ln g / d ln r| times the K1 tolerance of the radius,
 * plus |d ln g / d ln L| times the rounding of L_z/E (photonring's b, 4 ulp for kgeo's
 * lambda), plus 16 ulp for the two evaluations of g.
 */
export function redshiftComparisons(ray: KgeoRay, p: PhotonringRay): Comparison[] {
  const out: Comparison[] = [];
  const k1 = radiusComparisons(ray, p);
  for (const m of [0, 1]) {
    const gk = ray.g[m]!;
    const rk = ray.rs[m]!;
    const rp = p.radii[m];
    if (m > ray.nmax || !(gk > 0) || !(rk >= 6 && rk <= 20) || rp === undefined) continue;
    const c = k1.find((x) => x.n === m);
    if (!c) continue;
    const gp = redshiftFactor(circularOrbitEmitter(rp, 1), p.lzOverE);
    const x = p.lzOverE * rp ** -1.5;
    const slopeR = Math.abs(1.5 / rp / (1 - 3 / rp) - (1.5 * x) / (1 - x));
    const slopeL = Math.abs(x / (1 - x));
    const tol = slopeR * c.tol + slopeL * (Math.abs(p.b / p.bExact - 1) + 4 * ULP) + 16 * ULP;
    out.push({ n: m, rel: Math.abs(gp / gk - 1), tol });
  }
  return out;
}
