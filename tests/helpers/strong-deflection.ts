// Published strong deflection formulas for the ring images of a thin equatorial disk around a
// Schwarzschild black hole, transcribed from the papers, and the next term of the expansion with a
// bound on what is left (derived for this cross-check; not found in the sources read, listed in
// docs/PHYSICS.md 6b). Units G = c = M = 1 (the papers' m = 1); u = 1/r; eps = b/b_c - 1.
// Deliberately no import from src/physics: everything is written from the papers' own expressions,
// and the quadrature is this file's own. Used by tests/unit/published-rings.test.ts.
//
// Sources (equation numbers as printed in the arXiv versions read):
// - Bisnovatyi-Kogan and Tsupko (2022), Phys. Rev. D 105, 064040, arXiv:2201.01716v1 (BK-T).
// - Tsupko (2022), Phys. Rev. D 106, 064033, arXiv:2208.02084v2.
// - Aratore, Tsupko and Perlick (2024), Phys. Rev. D 109, 124057, arXiv:2402.14733v2.
// - Bozza and Scarpetta (2007), Phys. Rev. D 76, 083008, arXiv:0705.0246.
// - Iyer and Petters (2007), Gen. Relativ. Gravit. 39, 1563, arXiv:gr-qc/0611086v2.

const SQ3 = Math.sqrt(3);

/** Critical impact parameter b_cr = 3 sqrt(3) m: BK-T eq. (9), Tsupko eq. (3). */
export const B_CR = 3 * SQ3;

/**
 * f(r_S) of BK-T eq. (10), the same as Tsupko eq. (4):
 * f = 6^5 (1 - 3m/r_S) / (3 + sqrt 3)^2 * (3 + sqrt(3 + 18m/r_S))^(-2).
 */
export function bktF(rS: number): number {
  return ((6 ** 5 * (1 - 3 / rS)) / (3 + SQ3) ** 2) * (3 + Math.sqrt(3 + 18 / rS)) ** -2;
}

/** BK-T eq. (11), first printed form: f0 = 7776 / (3 + sqrt 3)^4, the limit r_S -> infinity. */
export const BKT_F0 = 7776 / (3 + SQ3) ** 4;
/** BK-T eq. (11), second printed form: f0 = 216 (7 - 4 sqrt 3). */
export const BKT_F0_PRODUCT = 216 * (7 - 4 * SQ3);

/**
 * BK-T eqs. (14) to (16), polar observer far away: theta_n = (b_cr / D_d) [1 + f(r_S) e^(-pi(n+1/2))],
 * returned as theta_n D_d / b_cr - 1. They state it for n >= 2 ("can be applied only for
 * higher-order images").
 */
export function bktRingOffset(rS: number, n: number): number {
  return bktF(rS) * Math.exp(-Math.PI * (n + 0.5));
}

/** BK-T eq. (44): solid angle of the unlensed disk, pi (r_out^2 - r_in^2), in units m^2 / D_d^2. */
export function bktSolidAngleUnlensed(rIn: number, rOut: number): number {
  return Math.PI * (rOut * rOut - rIn * rIn);
}

/**
 * Tsupko eq. (18): the azimuthal shift of the order-n image seen at screen angle phi
 * (counterclockwise from the horizontal axis) by an observer at inclination thetaO from the axis,
 * Delta phi = (n + 1) pi - arccos(sin phi / sqrt(sin^2 phi + cot^2 thetaO)). It combines his
 * eqs. (16), (17), (8), (10) and (13); Aratore et al. eq. (22) give it for every order n.
 */
export function tsupkoSweep(n: number, phi: number, thetaO: number): number {
  const s = Math.sin(phi);
  const cot = Math.cos(thetaO) / Math.sin(thetaO);
  return (n + 1) * Math.PI - Math.acos(s / Math.sqrt(s * s + cot * cot));
}

/** Tsupko eq. (5): impact parameter for the azimuthal shift Delta phi, b = b_cr [1 + f e^(-Delta phi)]. */
export function tsupkoImpactForSweep(rS: number, sweep: number): number {
  return B_CR * (1 + bktF(rS) * Math.exp(-sweep));
}

/**
 * Aratore, Tsupko and Perlick eq. (10) for the Schwarzschild metric, solved for eps:
 * Delta phi = -a log(eps / (eta_O eta_S)) + a log(2 beta_ph / b_cr^2) + k_O + k_S, with a = 1
 * (eq. 31), b_cr = 3 sqrt 3 (32), beta_ph = 81 (33), so 2 beta_ph / b_cr^2 = 6; eta = 1 - 3/r
 * (eq. 11); k_S from eq. (34), log(6 / (3 - eta + sqrt(9 - 6 eta))). By eq. (15) k_O is the same
 * integral up to eta_O, so eq. (34) with eta_O gives it at a finite r_O; at r_O = infinity
 * (eta_O = 1) it is eq. (35), log(6 / (2 + sqrt 3)). The paper itself then takes r_O to infinity.
 */
export function aratoreOffset(rO: number, rS: number, sweep: number): number {
  const eta = (r: number) => (r === Infinity ? 1 : 1 - 3 / r);
  const k = (e: number) => Math.log(6 / (3 - e + Math.sqrt(9 - 6 * e)));
  const etaO = eta(rO);
  const etaS = eta(rS);
  return etaO * etaS * 6 * Math.exp(k(etaO) + k(etaS) - sweep);
}

/**
 * Prefactor of the exponential in Aratore et al. eq. (36), their f(r_S):
 * (1 - 3/r_S) (2 + 3/r_S + sqrt(3 + 18/r_S))^(-1) 216 / (2 + sqrt 3).
 */
export function aratoreF36(rS: number): number {
  return ((1 - 3 / rS) / (2 + 3 / rS + Math.sqrt(3 + 18 / rS))) * (216 / (2 + SQ3));
}

/**
 * Bozza and Scarpetta eqs. (65) to (68), Schwarzschild, G = c = M = 1:
 * Delta phi - pi = -log(eps / ((1 - 3/D_LS)(1 - 3/D_OL))) + b, with a = 1 (65),
 * b = -pi + 5 log 6 + b_O + b_S (66) and b_i = -2 log(3 + sqrt(3 + 18/D_Li)) (67); D_OL is the
 * observer's radius and D_LS the source's. Solved for eps.
 */
export function bozzaScarpettaOffset(rO: number, rS: number, sweep: number): number {
  const bi = (d: number) => -2 * Math.log(3 + Math.sqrt(3 + (d === Infinity ? 0 : 18 / d)));
  const eta = (d: number) => (d === Infinity ? 1 : 1 - 3 / d);
  const b = -Math.PI + 5 * Math.log(6) + bi(rO) + bi(rS);
  return eta(rS) * eta(rO) * Math.exp(b - (sweep - Math.PI));
}

/**
 * Iyer and Petters eq. (27): alpha(b') = (sigma_0 + sigma_1 b' + ...) log(lambda_0 / b')
 * + rho_0 + rho_1 b' + ..., b' = 1 - b_c/b, for source and observer at infinity, with
 * lambda_0 = 216 (7 - 4 sqrt 3), sigma_0 = 1, sigma_1 = 5/18, rho_0 = -pi, rho_1 = (-17 + 4 sqrt 3)/18.
 */
export const IYER_PETTERS = {
  lambda0: 216 * (7 - 4 * SQ3),
  sigma1: 5 / 18,
  rho1: (-17 + 4 * SQ3) / 18,
} as const;

// ---------------------------------------------------------------------------------------------
// Next term of the expansion (derived for this cross-check; docs/PHYSICS.md 6b). With
// y = 1/3 - u and F(y) = y sqrt(1 - 2y), the critical orbit polynomial is F^2 and
// P = F^2 - eta, eta = 1/27 - 1/b^2. One leg from u_A to the turning point sweeps
//   L = (1/2) ln(1/eta) + K(y_A) + (15/8) eta ln(1/eta) + d(y_A) eta + O(eta^2 ln eta) + O(eta^2 / F_A^4),
// and the two legs together, with eta = (2 eps - 3 eps^2 + ...) / 27, give
//   Phi = -ln eps + ln(27/2) + K_o + K_R + (5/18) eps ln(1/eps) + D eps + rho.
// The published law is Phi = -ln eps_pub + ln(27/2) + K_o + K_R, so at the same sweep
//   ln(eps / eps_pub) = (5/18) eps ln(1/eps) + D eps + rho.
// ---------------------------------------------------------------------------------------------

/** 20-point Gauss-Legendre nodes and weights on [-1, 1], by Newton's method on P_20. */
const GL = (() => {
  const n = 20;
  const x: number[] = [];
  const w: number[] = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = z;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      const dp = (n * (z * p1 - p0)) / (z * z - 1);
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-15) {
        // Recompute the derivative at the converged node for the weight.
        let q0 = 1;
        let q1 = z;
        for (let k = 2; k <= n; k++) {
          const q2 = ((2 * k - 1) * z * q1 - (k - 1) * q0) / k;
          q0 = q1;
          q1 = q2;
        }
        const dq = (n * (z * q1 - q0)) / (z * z - 1);
        x.push(z);
        w.push(2 / ((1 - z * z) * dq * dq));
        break;
      }
    }
  }
  if (x.length !== n) throw new Error('Gauss-Legendre nodes did not converge');
  return { x, w };
})();

/** Composite 20-point Gauss-Legendre quadrature of f on [a, b] with `panels` equal panels. */
export function gaussLegendre(
  f: (x: number) => number,
  a: number,
  b: number,
  panels: number,
): number {
  const h = (b - a) / panels;
  let sum = 0;
  for (let p = 0; p < panels; p++) {
    const mid = a + (p + 0.5) * h;
    for (let i = 0; i < GL.x.length; i++) sum += GL.w[i]! * f(mid + 0.5 * h * GL.x[i]!);
  }
  return 0.5 * h * sum;
}

/**
 * Integrand of Reg: y^-3 (1 - 2y)^(-3/2) - y^-3 - 3 y^-2 - (15/2) y^-1. Below y = 0.05 it is
 * summed as the series sum_{k >= 3} c_k y^(k-3), c_k = (2k + 1)!! / k! (the coefficients of
 * (1 - 2y)^(-3/2)), which avoids the cancellation of the four terms.
 */
function regIntegrand(y: number): number {
  if (y < 0.05) {
    let c = 35 / 2; // c_3
    let s = 0;
    let p = 1;
    for (let k = 3; k < 60; k++) {
      s += c * p;
      p *= y;
      c *= (2 * k + 3) / (k + 1);
    }
    return s;
  }
  return y ** -3 * (1 - 2 * y) ** -1.5 - y ** -3 - 3 * y ** -2 - 7.5 / y;
}

function checkU(u: number): void {
  if (!(u >= 0 && u < 1 / 3)) throw new RangeError(`need 0 <= u < 1/3, got ${u}`);
}

/** K(y_A) = 2 ln 2 - 2 artanh(sqrt(1 - 2 y_A)), the constant of one leg, y_A = 1/3 - u. */
export function legK(u: number): number {
  checkU(u);
  return 2 * Math.LN2 - 2 * Math.atanh(Math.sqrt(1 / 3 + 2 * u));
}

/**
 * d(y_A) = -15/8 + (15/4) ln 2 + (1/2) [Reg(y_A) - 1/(2 y_A^2) - 3/y_A + (15/2) ln y_A - 4],
 * Reg(y_A) = integral from 0 to y_A of regIntegrand, the coefficient of eta in one leg.
 */
export function legD(u: number): number {
  checkU(u);
  const y = 1 / 3 - u;
  const reg = gaussLegendre(regIntegrand, 0, y, 64);
  return -15 / 8 + 3.75 * Math.LN2 + 0.5 * (reg - 1 / (2 * y * y) - 3 / y + 7.5 * Math.log(y) - 4);
}

/** D = 3/2 + (5/18) ln(27/2) + (2/27) [d(y_o) + d(y_R)], the coefficient of eps in Phi. */
export function nextOrderD(uo: number, uR: number): number {
  return 1.5 + (5 / 18) * Math.log(27 / 2) + (2 / 27) * (legD(uo) + legD(uR));
}

/**
 * Bound on the remainder rho: B = eps^2 ln(1/eps) + z_o^2 + z_R^2 + 1e-15/eps, with
 * z_A = 2 eps / (27 F(y_A)^2). The first three terms are the orders left out (the eta^2 ln eta
 * term, and the next term of arcosh(F_A / sqrt(eta)) in each leg, which grows as the end nears
 * the photon sphere); the form is derived, the coefficient 1 is a choice. The last term is the
 * f64 floor: b = b_c (1 + eps) carries eps to about 1.1e-16 absolute, so ln eps to 1.1e-16/eps;
 * the solver's tolerance in ln eps (up to about 8.5e-15) and the rounding of the sweep integrals
 * (about 2e-14) are below 1e-15/eps for eps <= 0.05, and far below eps^2 ln(1/eps) above that.
 */
export function remainderBound(eps: number, uo: number, uR: number): number {
  const F = (u: number) => {
    const y = 1 / 3 - u;
    return y * Math.sqrt(1 - 2 * y);
  };
  const zo = (2 * eps) / (27 * F(uo) ** 2);
  const zR = (2 * eps) / (27 * F(uR) ** 2);
  return eps * eps * Math.log(1 / eps) + zo * zo + zR * zR + 1e-15 / eps;
}
