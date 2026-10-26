// Reference values for the swept angle and deflection angle of a photon, by two independent
// methods: Gauss-Legendre quadrature after a change of variables, and Carlson elliptic integrals.
// Derivations: docs/PHYSICS.md, section "Deflection angle".
import { criticalImpactParameter } from './constants.ts';
import { carlsonRF, integrate } from './numerics.ts';
import { orbitPolynomial, orbitRoots } from './orbits.ts';

function checkInterval(uA: number, uB: number): void {
  if (!(uA >= 0 && uB > uA)) {
    throw new RangeError(`need 0 <= uA < uB, got uA = ${uA}, uB = ${uB}`);
  }
}

/**
 * Polar angle swept by a photon of impact parameter b while u = 1/r runs over [uA, uB]:
 * integral of du / sqrt(P(u)). For b > b_c the interval must end at or before the turning point
 * u2; for b <= b_c it must stay where P(u) is well away from zero (any interval with u <= 1/(4M)).
 */
export function sweptAngleQuadrature(b: number, uA: number, uB: number, M: number): number {
  checkInterval(uA, uB);
  if (b <= criticalImpactParameter(M)) {
    if (uB > 1 / (4 * M)) throw new RangeError(`b <= b_c needs uB <= 1/(4M), got ${uB}`);
    return integrate((u) => 1 / Math.sqrt(orbitPolynomial(u, b, M)), uA, uB, 8);
  }

  const roots = orbitRoots(b, M);
  const { u2, q0 } = roots;
  if (uB > u2) throw new RangeError(`uB = ${uB} is beyond the turning point u2 = ${u2}`);

  // u = u2 - s^2 removes the 1/sqrt(u2 - u) singularity at the turning point. P(u) = (u2 - u) Q(u)
  // with Q(u2 - s^2) = Q0 + kappa s^2 - 2M s^4 exactly; Q0 = Q(u2) vanishes as b -> b_c.
  const bigQ0 = 6 * M * u2 * q0;
  const kappa = 1 - 6 * M * q0;
  const sHi = Math.sqrt(u2 - uA);
  const sLo = Math.sqrt(u2 - uB);

  if (kappa > 0) {
    // Near-critical regime: Q0 + kappa s^2 has a narrow minimum at s = 0, so substitute
    // s = c sinh(tau) with c = sqrt(Q0 / kappa). The integrand in tau is smooth and O(1).
    const c = Math.sqrt(bigQ0 / kappa);
    const c4 = c ** 4;
    const tLo = Math.asinh(sLo / c);
    const tHi = Math.asinh(sHi / c);
    const f = (t: number) => {
      const ch = Math.cosh(t);
      const sh = Math.sinh(t);
      return (2 * c * ch) / Math.sqrt(bigQ0 * ch * ch - 2 * M * c4 * sh ** 4);
    };
    return integrate(f, tLo, tHi, Math.max(4, Math.ceil((tHi - tLo) / 0.5)));
  }
  const f = (s: number) => 2 / Math.sqrt(bigQ0 + kappa * s * s - 2 * M * s ** 4);
  return integrate(f, sLo, sHi, Math.max(4, Math.ceil(((sHi - sLo) * Math.sqrt(M)) / 0.1)));
}

/**
 * The same swept angle as a closed form in Carlson's R_F, for b > b_c and 0 <= uA < uB <= u2.
 * Uses the reduction of a cubic elliptic integral to R_F (DLMF 19.29.4 with a4 = 1, b4 = 0).
 */
export function sweptAngleElliptic(b: number, uA: number, uB: number, M: number): number {
  checkInterval(uA, uB);
  const { u1, u2, u3, d21, d32 } = orbitRoots(b, M);
  if (uB > u2) throw new RangeError(`uB = ${uB} is beyond the turning point u2 = ${u2}`);
  const atTurningPoint = uB === u2;
  // Factors of P(u) = 2M (u - u1)(u2 - u)(u3 - u), evaluated at x = uB and y = uA.
  const x1 = Math.sqrt(atTurningPoint ? d21 : uB - u1);
  const x2 = atTurningPoint ? 0 : Math.sqrt(u2 - uB);
  const x3 = Math.sqrt(atTurningPoint ? d32 : u3 - uB);
  const y1 = Math.sqrt(uA - u1);
  const y2 = Math.sqrt(u2 - uA);
  const y3 = Math.sqrt(u3 - uA);
  const d = uB - uA;
  const u12 = (x1 * x2 * y3 + y1 * y2 * x3) / d;
  const u13 = (x1 * x3 * y2 + y1 * y3 * x2) / d;
  const u14 = (x1 * y2 * y3 + y1 * x2 * x3) / d;
  return (2 * carlsonRF(u12 * u12, u13 * u13, u14 * u14)) / Math.sqrt(2 * M);
}

/** Total deflection alpha(b) = 2 * (swept angle from infinity to the turning point) - pi, by quadrature. */
export function deflectionAngleQuadrature(b: number, M: number): number {
  return 2 * sweptAngleQuadrature(b, 0, orbitRoots(b, M).u2, M) - Math.PI;
}

/** Total deflection alpha(b) from the elliptic-integral closed form. */
export function deflectionAngleElliptic(b: number, M: number): number {
  return 2 * sweptAngleElliptic(b, 0, orbitRoots(b, M).u2, M) - Math.PI;
}

// Keeton and Petters (2005), Phys. Rev. D 72, 104006, eqs. (24)-(25): alpha = sum A_n (M/b)^n.
const WEAK_FIELD_COEFFICIENTS = [
  4,
  (15 * Math.PI) / 4,
  128 / 3,
  (3465 * Math.PI) / 64,
  3584 / 5,
  (255255 * Math.PI) / 256,
];

/** Weak-field series for the deflection angle, truncated after `terms` terms (1 to 6). */
export function weakFieldDeflection(b: number, M: number, terms: number): number {
  if (!(terms >= 1 && terms <= WEAK_FIELD_COEFFICIENTS.length)) {
    throw new RangeError(`terms must be 1 to ${WEAK_FIELD_COEFFICIENTS.length}`);
  }
  let sum = 0;
  for (let n = terms; n >= 1; n--) {
    sum += (WEAK_FIELD_COEFFICIENTS[n - 1] as number) * (M / b) ** n;
  }
  return sum;
}

/**
 * Strong deflection limit of Bozza (2002), Phys. Rev. D 66, 103001, eq. (50) written in the
 * impact parameter: alpha = -ln(b/b_c - 1) + ln[216 (7 - 4 sqrt 3)] - pi + O(b - b_c).
 */
export function strongFieldDeflection(b: number, M: number): number {
  const bc = criticalImpactParameter(M);
  return -Math.log((b - bc) / bc) + Math.log(216 * (7 - 4 * Math.sqrt(3))) - Math.PI;
}
