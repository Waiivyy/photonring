// Photon and particle orbit relations in the Schwarzschild equatorial plane.
// Derivations: docs/PHYSICS.md, sections "Null geodesics" and "Roots of the orbit polynomial".
import { criticalImpactParameter } from './constants.ts';

const SQRT3 = Math.sqrt(3);

/** Photon effective potential V(r) = (1 - 2M/r) / r^2. A photon of impact parameter b turns where V = 1/b^2. */
export function photonPotential(r: number, M: number): number {
  return (1 - (2 * M) / r) / (r * r);
}

/** Orbit polynomial P(u) = (du/dphi)^2 = 1/b^2 - u^2 + 2 M u^3, with u = 1/r. */
export function orbitPolynomial(u: number, b: number, M: number): number {
  return 1 / (b * b) - u * u + 2 * M * u * u * u;
}

/** Squared specific angular momentum of a circular timelike orbit, L^2 = M r^2 / (r - 3M). */
export function circularOrbitAngularMomentumSq(r: number, M: number): number {
  return (M * r * r) / (r - 3 * M);
}

/**
 * Real roots u1 < 0 < u2 <= 1/(3M) <= u3 < 1/(2M) of P(u) for b > b_c, plus the differences
 * that the deflection integrals need, each computed without cancellation.
 * u2 is the turning point of a photon arriving from infinity.
 */
export interface OrbitRoots {
  readonly u1: number;
  readonly u2: number;
  readonly u3: number;
  /** u2 - u1 */
  readonly d21: number;
  /** u3 - u2, small near b_c */
  readonly d32: number;
  /** u3 - u1 */
  readonly d31: number;
  /** 1/(3M) - u2, small near b_c */
  readonly q0: number;
}

export function orbitRoots(b: number, M: number): OrbitRoots {
  const bc = criticalImpactParameter(M);
  if (!(b > bc)) {
    throw new RangeError(`orbitRoots needs b > b_c = ${bc}, got ${b}`);
  }
  // Trigonometric solution with the angle split as theta + eta = pi/3: theta -> 0 at b_c and
  // eta -> 0 as b -> infinity. Compute whichever angle is small directly, so both limits keep
  // full relative precision.
  let theta: number;
  let eta: number;
  if (b < 2 * bc) {
    theta = (4 / 3) * Math.asin(Math.sqrt((b - bc) / (2 * b)));
    eta = Math.PI / 3 - theta;
  } else {
    eta = (2 / 3) * Math.asin(bc / b);
    theta = Math.PI / 3 - eta;
  }
  const k = 1 / (3 * M);
  const sinHalfEtaSq = Math.sin(eta / 2) ** 2;
  const sinEta = Math.sin(eta);
  return {
    u1: k * sinHalfEtaSq - (SQRT3 / 2) * k * sinEta,
    u2: k * sinHalfEtaSq + (SQRT3 / 2) * k * sinEta,
    u3: k * (0.5 + Math.cos(eta)),
    d21: SQRT3 * k * sinEta,
    d32: SQRT3 * k * Math.sin(theta),
    d31: SQRT3 * k * Math.cos(eta - Math.PI / 6),
    q0: k * (Math.sin(theta / 2) ** 2 + (SQRT3 / 2) * Math.sin(theta)),
  };
}
