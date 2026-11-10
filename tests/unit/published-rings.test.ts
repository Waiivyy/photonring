// Cross-check of photonring's ring images against published strong deflection formulas for a thin
// disk around a Schwarzschild black hole (Stage 8 item 5, part A). The published formulas are in
// tests/helpers/strong-deflection.ts, transcribed from the papers with no import from src/physics.
// A1 to A3: the published law and the published azimuthal shift are photonring's own leading-order
// law and sweep (identities, so these are documentation rows, not independent checks). A4 and A5:
// photonring's exact solver against the published law, with a tolerance from the next term of the
// expansion (derived for this cross-check; not found in the sources read). A6, A7 and the area case
// reproduce numerical results printed in the papers: outside checks. A8: photonring's shadow radius
// against the series of its own formula, whose leading term is the papers' b_c / D (a consistency
// check). Derivations: docs/PHYSICS.md, section 6b; measured values: docs/VALIDATION.md.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cameraFrame,
  criticalImpactParameter,
  criticalOrbitSweep,
  firstPlaneCrossingAngle,
  orbitRoots,
  outboundImageOffset,
  outboundSweep,
  ringImageAngle,
  shadowAngularRadius,
  subringOffset,
  subringOffsetLeadingOrder,
  sweptAngleElliptic,
} from '../../src/physics/index.ts';
import { measured } from '../helpers/measured.ts';
import {
  aratoreF36,
  aratoreOffset,
  B_CR,
  BKT_F0,
  BKT_F0_PRODUCT,
  bktF,
  bktRingOffset,
  bktSolidAngleUnlensed,
  bozzaScarpettaOffset,
  gaussLegendre,
  IYER_PETTERS,
  legD,
  legK,
  nextOrderD,
  remainderBound,
  tsupkoImpactForSweep,
  tsupkoSweep,
} from '../helpers/strong-deflection.ts';

const M = 1;
const BC = criticalImpactParameter(M);
const U = 2 ** -53; // unit roundoff of f64

/**
 * Relative tolerance, in rounding only, of an identity between two forms of the leading-order law,
 * in ulp (2^-52): 100 for photonring's constant C = 216 (7 - 4 sqrt 3), whose subtraction turns
 * the rounding of 4 sqrt 3 into up to 98 ulp, taking Math.sqrt within 1 ulp (about 28 ulp if it is
 * correctly rounded; the A1 test of eq. 11 measures 23); 4 per unit of
 * the exponent's argument, which is about the sweep in size; and 6 / eta at each end, eta = 1 - 3/r:
 * one in f, which carries eta, and about three more through dphi_c, whose artanh has the slope
 * 3 / (2 eta) near the photon sphere (the dominant term there).
 */
const identityTolerance = (rO: number, R: number, sweep: number) =>
  2 ** -52 * (100 + 4 * (1 + sweep) + 6 / (1 - 3 / rO) + 6 / (1 - 3 / R));

/**
 * Five view directions of tests/unit/subrings.test.ts: camera elevation and image angle theta
 * (from image right towards image up). Each gives the phase phi0 of the first disk-plane
 * crossing, which does not depend on the distance.
 */
const VIEWS = [
  { el: 90, theta: 0 },
  { el: 12, theta: 90 },
  { el: 12, theta: 270 },
  { el: 78, theta: 90 },
  { el: 78, theta: 270 },
] as const;

function viewPhase(el: number, theta: number, rObs = 30, azimuthDeg = 0): number {
  const f = cameraFrame({ distance: rObs, azimuthDeg, elevationDeg: el, fovYDeg: 60 }, M);
  const t = (theta * Math.PI) / 180;
  const e2z = Math.cos(t) * f.right[2] + Math.sin(t) * f.up[2];
  const phi0 = firstPlaneCrossingAngle(f.position[2] / rObs, e2z);
  if (phi0 === undefined) throw new Error('ray plane is the disk plane');
  return phi0;
}

describe('A1: Bisnovatyi-Kogan and Tsupko (2022), polar observer at infinity', () => {
  const RADII = [
    3.001, 3.01, 3.1, 3.3, 3.5, 4, 5, 6, 8, 10, 15, 20, 30, 50, 100, 1e3, 1e4, 1e6, 1e8,
  ];

  it("their eq. (15) is photonring's leading-order law with rObs = Infinity", () => {
    // f(r_S) = C exp(-dphi_c(1/r_S)) is an identity (docs/PHYSICS.md 6b); the tolerance is
    // rounding only.
    for (const R of RADII) {
      for (let n = 0; n <= 10; n++) {
        const lib = subringOffsetLeadingOrder(Infinity, R, n, Math.PI / 2, M);
        const rel = Math.abs(bktRingOffset(R, n) / lib - 1);
        expect(
          measured(
            'published rings A1: BK-T eq. 15 against the leading-order law, fraction of tolerance',
            rel / identityTolerance(Infinity, R, Math.PI * (n + 0.5)),
          ),
        ).toBeLessThan(1);
        measured('published rings A1: BK-T eq. 15 against the leading-order law, relative', rel);
      }
    }
  });

  it('the scale is their eq. (11) and Aratore et al. eq. (36) has the same f(r_S)', () => {
    // 216 (7 - 4 sqrt 3) cancels: 7 - 4 sqrt 3 = 0.0718 turns the rounding of 4 sqrt 3 (up to
    // 8 sqrt 3 u absolute, taking Math.sqrt within 1 ulp) into 193 u relative; 7776 / (3 + sqrt 3)^4
    // adds about 9 u. With Math.sqrt correctly rounded, the sqrt 3 the two forms share gives about
    // 55 u; the bound keeps the 1 ulp model.
    expect(
      measured(
        'published rings A1: the two forms of BK-T eq. 11, relative, in units of u',
        Math.abs(BKT_F0 / BKT_F0_PRODUCT - 1) / U,
      ),
    ).toBeLessThan(205);
    expect(
      measured(
        'published rings A1: BK-T eq. 10 at r_S = 1e300 against eq. 11, relative, in units of u',
        Math.abs(bktF(1e300) / BKT_F0 - 1) / U,
      ),
    ).toBeLessThan(8);
    expect(BKT_F0).toBeCloseTo(15.5, 1); // "~ 15.5" in eq. (11)
    for (const R of RADII) {
      const rel = Math.abs(aratoreF36(R) / bktF(R) - 1);
      expect(
        measured('published rings A1: Aratore eq. 36 against BK-T eq. 10, relative', rel),
      ).toBeLessThan(identityTolerance(Infinity, R, 0));
    }
  });
});

describe('A2: Bozza and Scarpetta (2007) and Aratore et al. (2024), observer at a finite distance', () => {
  it("their law is photonring's leading-order law", () => {
    for (const rO of [5, 6.5, 10, 30, 100, 200, 1000, 1e4, 1e6, Infinity]) {
      for (const R of [3.3, 4, 6, 10, 20, 30, 100]) {
        for (let n = 0; n <= 5; n++) {
          for (const phi0 of [0.1, Math.PI / 4, Math.PI / 2, 2.5, Math.PI]) {
            const lib = subringOffsetLeadingOrder(rO, R, n, phi0, M);
            const sweep = phi0 + n * Math.PI;
            for (const [name, pub] of [
              ['Aratore et al. eq. 10', aratoreOffset(rO, R, sweep)],
              ['Bozza and Scarpetta eq. 68', bozzaScarpettaOffset(rO, R, sweep)],
            ] as const) {
              const rel = Math.abs(pub / lib - 1);
              expect(
                measured(
                  `published rings A2: ${name} against the leading-order law, fraction of tolerance`,
                  rel / identityTolerance(rO, R, sweep),
                ),
              ).toBeLessThan(1);
              measured(`published rings A2: ${name} against the leading-order law, relative`, rel);
            }
          }
        }
      }
    }
  });
});

describe('A3: Tsupko (2022) eq. (18), azimuthal shift for any inclination', () => {
  it("equals photonring's sweep phi0 + n pi from real camera frames", () => {
    // Tsupko's inclination is from the disk axis (theta_O = 90 - elevation) and his screen angle
    // runs counterclockwise from the horizontal axis, as photonring's image angle does; the
    // mirrored convention would fail here. Aratore et al. (2024) eq. (22) give the same shift for
    // every order, so n = 0 and 1 are included.
    let count = 0;
    for (const el of [1, 5, 12, 17, 30, 45, 60, 73, 78, 85, 89, 90]) {
      for (const az of [0, 40]) {
        for (let t = 0; t < 360; t += 7.5) {
          const phi0 = viewPhase(el, t, 30, az);
          for (let n = 0; n <= 5; n++) {
            const pub = tsupkoSweep(n, (t * Math.PI) / 180, ((90 - el) * Math.PI) / 180);
            const err = Math.abs(phi0 + n * Math.PI - pub);
            expect(
              measured('published rings A3: Tsupko eq. 18 sweep against phi0 + n pi, rad', err),
            ).toBeLessThan(1e-13);
            count++;
          }
        }
      }
    }
    expect(count).toBe(12 * 2 * 48 * 6);
  });
});

describe('next-order term (derived; not found in the sources read)', () => {
  it('at infinity it reproduces Iyer and Petters (2007) eq. (27)', () => {
    // Their series in b' = 1 - b_c/b = eps - eps^2 + ...: Phi = pi + alpha gives
    // c = sigma_1 = 5/18 and D(inf, inf) = 1 + sigma_1 ln(lambda_0) + rho_1.
    const { lambda0, sigma1, rho1 } = IYER_PETTERS;
    expect(sigma1).toBe(5 / 18);
    const expected = 1 + sigma1 * Math.log(lambda0) + rho1;
    const err = Math.abs(nextOrderD(0, 0) - expected);
    // Rounding: d sums four terms up to about 26 in size, then D scales them by 2/27; with the
    // quadrature converged to rounding (next test) that is a few times 1e-15. 1e-13 leaves room.
    expect(
      measured('published rings: D(inf, inf) against Iyer and Petters, absolute', err),
    ).toBeLessThan(1e-13);
  });

  it('the dependence of d on the end radius matches a direct quadrature', () => {
    // d(y_A) - d(y_B) = (1/2) int dy / F^3 = -(1/2) int_{u_B}^{u_A} P_c(u)^(-3/2) du, the eta
    // derivative of a regular integral, computed here with no part of d's closed form.
    const pc = (u: number) => (u - 1 / 3) ** 2 * (2 * u + 1 / 3);
    for (const [uA, uB] of [
      [1 / 6, 0],
      [1 / 3.3, 1 / 30],
      [1 / 20, 1 / 1000],
      [1 / 4, 1 / 5],
    ] as const) {
      const direct = -0.5 * gaussLegendre((u) => pc(u) ** -1.5, uB, uA, 64);
      const rel = Math.abs((legD(uA) - legD(uB)) / direct - 1);
      // Both sides are quadratures of smooth integrands converged to rounding.
      expect(
        measured('published rings: d difference against direct quadrature, relative', rel),
      ).toBeLessThan(1e-13);
    }
  });

  it('the constant term is the published one: ln(27/2) + K_o + K_R = ln C - dphi_c(u_o) - dphi_c(u_R)', () => {
    // Sums of a few logs and artanh values of size up to about 3: a few ulp of 3 is near 1e-15,
    // and 1e-14 leaves a factor of about 10.
    const key = 'published rings: constant term against ln C - dphi_c, absolute';
    for (const u of [0, 1 / 1000, 1 / 30, 1 / 6, 1 / 3.3]) {
      expect(measured(key, Math.abs(legK(u) - legK(0) + criticalOrbitSweep(u, M)))).toBeLessThan(
        1e-14,
      );
    }
    expect(measured(key, Math.abs(Math.log(27 / 2) + 2 * legK(0) - Math.log(BKT_F0)))).toBeLessThan(
      1e-14,
    );
  });

  it('D gives the fitted constants of the ratio law in docs/PHYSICS.md 6b', () => {
    // A = (1 - e^-pi) D - (5/18) pi e^-pi; fitted -0.28 at 6 M and +0.69 at 20 M (observer 30 M),
    // given to two decimals, so the bound is half a unit of the second.
    const A = (R: number) =>
      (1 - Math.exp(-Math.PI)) * nextOrderD(1 / 30, 1 / R) -
      (5 / 18) * Math.PI * Math.exp(-Math.PI);
    const key = 'published rings: A(6) and A(20) against the Stage 7 fits, absolute';
    expect(measured(key, Math.abs(A(6) + 0.28))).toBeLessThan(0.005);
    expect(measured(key, Math.abs(A(20) - 0.69))).toBeLessThan(0.005);
  });
});

/** A4 and A5 cases: exact eps against the published law with the observer kept. */
interface Case {
  readonly rO: number;
  readonly R: number;
  readonly n: number;
  readonly sweep: number;
  readonly eps: number;
  readonly route: string;
}

let cachedCases:
  | {
      cases: Case[];
      skippedInbound: number;
      guardDecisive: number;
      solverRefused: number;
      skippedBound: number;
    }
  | undefined;

function a4Cases() {
  if (cachedCases) return cachedCases;
  const phases = [
    ...Array.from({ length: 16 }, (_, k) => ((k + 1) * Math.PI) / 16),
    ...VIEWS.map((v) => viewPhase(v.el, v.theta)),
  ];
  const cases: Case[] = [];
  let skippedInbound = 0; // left out by the branch guard
  let guardDecisive = 0; // of those, cases the B filter alone would have kept
  let solverRefused = 0; // at infinity, sweeps outboundImageOffset refuses as inbound
  let skippedBound = 0;
  for (const rO of [Infinity, 1000, 200, 30, 5]) {
    const uo = rO === Infinity ? 0 : 1 / rO;
    for (const R of [3.1, 3.3, 3.5, 4, 5, 6, 8, 10, 15, 20, 30]) {
      const uR = 1 / R;
      const uT = Math.max(uo, uR);
      // Branch guard: the expansion is for rays that turn between the two ends.
      const threshold = outboundSweep(1 / (uT * Math.sqrt(1 - 2 * M * uT)), uo, uR, M);
      for (const phi0 of phases) {
        for (let n = 1; n <= 5; n++) {
          const sweep = phi0 + n * Math.PI;
          const routes: [string, () => number][] = [];
          if (rO === Infinity) {
            routes.push(['outboundImageOffset', () => outboundImageOffset(0, uR, sweep, M)]);
          } else {
            routes.push(['subringOffset', () => subringOffset(rO, R, n, phi0, M)]);
            if (sweep <= 4 * Math.PI) {
              const k = Math.sqrt(1 - (2 * M) / rO) / rO;
              routes.push([
                'ringImageAngle',
                () => Math.sin(ringImageAngle(rO, R, sweep, M)) / (k * BC) - 1,
              ]);
            }
          }
          for (const [route, solve] of routes) {
            let eps: number;
            try {
              eps = solve();
            } catch (e) {
              // Only outboundImageOffset throws here, for a sweep short of its outbound branch;
              // any other error fails the test.
              if (/below the outbound branch/.test((e as Error).message)) {
                solverRefused++;
                continue;
              }
              throw e;
            }
            const B = remainderBound(eps, uo, uR);
            if (!(sweep > threshold)) {
              skippedInbound++;
              if (B <= 0.01) guardDecisive++;
              continue;
            }
            if (B > 0.01) {
              skippedBound++;
              continue;
            }
            cases.push({ rO, R, n, sweep, eps, route });
          }
        }
      }
    }
  }
  cachedCases = { cases, skippedInbound, guardDecisive, solverRefused, skippedBound };
  return cachedCases;
}

const published = (c: Case) =>
  c.rO === Infinity ? bktF(c.R) * Math.exp(-c.sweep) : aratoreOffset(c.rO, c.R, c.sweep);

describe('A4: exact solver against the published law plus the derived next term', () => {
  it('ln(eps / eps_pub) - (5/18) eps ln(1/eps) - D eps is within the remainder bound B', () => {
    // B = eps^2 ln(1/eps) + z_o^2 + z_R^2 + 1e-15/eps (tests/helpers/strong-deflection.ts): its
    // form is derived, its coefficient 1 is a choice. Cases with B > 0.01 are left out, and so
    // are rays that do not turn between the observer and the ring. The guard is explicit and is
    // needed: at R = 3.1 M, observer at 30 M, n = 1, phi0 = 3 pi/16 such a case has B = 6.5e-4
    // but a residual of -5.09, so the B filter alone would keep it. The test asserts at least one
    // such case, so removing the guard fails it.
    const { cases, skippedInbound, guardDecisive, solverRefused } = a4Cases();
    expect(cases.length).toBeGreaterThan(3000);
    expect(
      measured('published rings A4: cases only the branch guard leaves out', guardDecisive, 'min'),
    ).toBeGreaterThanOrEqual(1);
    for (const c of cases) {
      const uo = c.rO === Infinity ? 0 : 1 / c.rO;
      const D = nextOrderD(uo, 1 / c.R);
      const rho =
        Math.log(c.eps / published(c)) - (5 / 18) * c.eps * Math.log(1 / c.eps) - D * c.eps;
      const ratio = Math.abs(rho) / remainderBound(c.eps, uo, 1 / c.R);
      expect(
        measured('published rings A4: |remainder| as a fraction of B', ratio),
        `${c.route} rO=${c.rO} R=${c.R} sweep=${c.sweep}`,
      ).toBeLessThan(1);
      measured(`published rings A4: |remainder| as a fraction of B, ${c.route}`, ratio);
    }
    measured('published rings A4: cases checked', cases.length, 'min');
    measured('published rings A4: inbound cases left out', skippedInbound);
    measured('published rings A4: inbound sweeps refused by outboundImageOffset', solverRefused);
  }, 60_000);
});

describe('A5: the published law as published (follows from A4; not an independent check)', () => {
  it('|ln(eps / eps_pub)| <= (5/18) eps ln(1/eps) + |D| eps + B', () => {
    // The bound is the predicted error plus B, so where D > 0 the error is close to it by
    // construction; the informative numbers are the errors per order, measured here.
    for (const c of a4Cases().cases) {
      const uo = c.rO === Infinity ? 0 : 1 / c.rO;
      const D = nextOrderD(uo, 1 / c.R);
      const err = Math.abs(Math.log(c.eps / published(c)));
      const bound =
        (5 / 18) * c.eps * Math.log(1 / c.eps) +
        Math.abs(D) * c.eps +
        remainderBound(c.eps, uo, 1 / c.R);
      expect(
        measured('published rings A5: error as a fraction of its bound', err / bound),
      ).toBeLessThan(1);
      measured(
        `published rings A5: published law relative error in eps, order ${c.n}, worst over the A4 cases`,
        Math.abs(published(c) / c.eps - 1),
      );
    }
  }, 60_000);

  it('the error in eps for n = 2, polar observer at infinity (BK-T eq. 15)', () => {
    for (const R of [6, 20]) {
      const eps = outboundImageOffset(0, 1 / R, 2.5 * Math.PI, M);
      const rel = Math.abs(bktRingOffset(R, 2) / eps - 1);
      const D = nextOrderD(0, 1 / R);
      const bound =
        (5 / 18) * eps * Math.log(1 / eps) + Math.abs(D) * eps + remainderBound(eps, 0, 1 / R);
      expect(rel).toBeLessThan(Math.expm1(bound));
      measured(`published rings A5: BK-T eq. 15 relative error in eps, n = 2, R = ${R} M`, rel);
      // The same as a fraction of the angular radius b / b_c = 1 + eps.
      measured(
        `published rings A5: BK-T eq. 15 error in the angular radius, n = 2, R = ${R} M`,
        Math.abs(bktRingOffset(R, 2) - eps) / (1 + eps),
      );
    }
  });
});

interface Fig6Panel {
  readonly dphiOverPi: number;
  readonly yTicks: readonly { readonly value: number; readonly y: number }[];
  readonly xTicks: readonly { readonly r: number; readonly x: number }[];
  readonly markers: readonly {
    readonly r: number;
    readonly x: number;
    readonly y: number;
    readonly value: number;
  }[];
  readonly tolerance: number;
}

/** Least-squares line y = a + b x. */
function lineFit(xs: readonly number[], ys: readonly number[]) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((v, i) => {
    sxy += (v - mx) * (ys[i]! - my);
    sxx += (v - mx) ** 2;
  });
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/** Tsupko (2022) Fig. 6 digitized: tests/data/tsupko2022-fig6.json (method in the file). */
function fig6Panels(): Fig6Panel[] {
  const text = readFileSync(new URL('../data/tsupko2022-fig6.json', import.meta.url), 'utf8');
  return (JSON.parse(text) as { panels: Fig6Panel[] }).panels;
}

describe('A6: Tsupko (2022) Fig. 6, his numerical integration (digitized)', () => {
  it('the fixture calibrates: ticks on straight axes, markers at r_S = 3.3, 4, 6, 10, 20, 30', () => {
    const panels = fig6Panels();
    expect(panels.map((p) => p.dphiOverPi)).toEqual([2, 2.5, 3]);
    for (const p of panels) {
      const yFit = lineFit(
        p.yTicks.map((t) => t.y),
        p.yTicks.map((t) => t.value),
      );
      for (const t of p.yTicks) {
        const px = Math.abs((yFit.a + yFit.b * t.y - t.value) / yFit.b);
        expect(measured('published rings A6: y tick off the fitted axis, px', px)).toBeLessThan(
          0.25,
        );
      }
      const xFit = lineFit(
        p.xTicks.map((t) => t.x),
        p.xTicks.map((t) => Math.log10(t.r)),
      );
      expect(p.markers.map((m) => m.r)).toEqual([3.3, 4, 6, 10, 20, 30]);
      for (const m of p.markers) {
        const r = 10 ** (xFit.a + xFit.b * m.x);
        expect(
          measured('published rings A6: marker radius from its x, relative', Math.abs(r / m.r - 1)),
        ).toBeLessThan(1e-3);
        // The stored value is the calibration applied to the stored pixel position.
        expect(Math.abs(yFit.a + yFit.b * m.y - m.value)).toBeLessThan(0.01 * Math.abs(yFit.b));
      }
      // The tolerance is one pixel of the embedded raster, rounded up to two digits.
      expect(p.tolerance).toBeGreaterThanOrEqual(Math.abs(yFit.b));
      expect(p.tolerance).toBeLessThan(1.1 * Math.abs(yFit.b));
    }
  });

  it('photonring b_c (eps_exact - eps_pub) matches every marker within one pixel', () => {
    for (const p of fig6Panels()) {
      const dphi = p.dphiOverPi * Math.PI;
      const yFit = lineFit(
        p.yTicks.map((t) => t.y),
        p.yTicks.map((t) => t.value),
      );
      for (const m of p.markers) {
        const digitized = yFit.a + yFit.b * m.y;
        const ours =
          BC * (1 + outboundImageOffset(0, 1 / m.r, dphi, M)) - tsupkoImpactForSweep(m.r, dphi);
        const diff = Math.abs(ours - digitized);
        expect(
          measured(
            'published rings A6: photonring against Fig. 6, fraction of tolerance',
            diff / p.tolerance,
          ),
          `dphi = ${p.dphiOverPi} pi, r_S = ${m.r}`,
        ).toBeLessThan(1);
        measured(
          `published rings A6: photonring against Fig. 6, px, dphi = ${p.dphiOverPi} pi`,
          diff / Math.abs(yFit.b),
        );
      }
    }
  });
});

/** Direct image (inbound branch) of the ring R at sweep pi/2, observer at infinity (u_o = 0). */
function directImageAtInfinity(R: number): number {
  const uR = 1 / R;
  const sweep = (b: number) => sweptAngleElliptic(b, 0, Math.min(uR, orbitRoots(b, M).u2), M);
  let lo = BC * (1 + 1e-12);
  let hi = R / Math.sqrt(1 - (2 * M) / R); // turns exactly at R
  expect(sweep(lo)).toBeLessThan(Math.PI / 2);
  expect(sweep(hi)).toBeGreaterThan(Math.PI / 2);
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (mid === lo || mid === hi) break;
    if (sweep(mid) < Math.PI / 2) lo = mid;
    else hi = mid;
  }
  return (0.5 * (lo + hi)) / BC - 1;
}

describe('A7: Bisnovatyi-Kogan and Tsupko (2022) eqs. (50) and (51), their numerical integration', () => {
  it('solid angles of the n = 0 and n = 1 images of a disk from 6 to 15 M, polar observer at infinity', () => {
    // Definitions pinned: Omega_S = pi (15^2 - 6^2) exactly (their eq. 44; eq. 46 prints 594),
    // theta = b / D_d for an observer at infinity (u_o = 0), no other factor. The tolerance is one
    // unit of the last quoted digit: they state neither their rounding nor their accuracy, and
    // their printed 594 alone moves the first ratio by 4e-4.
    const omegaS = bktSolidAngleUnlensed(6, 15);
    const omega = (eIn: number, eOut: number) =>
      Math.PI * B_CR * B_CR * ((1 + eOut) ** 2 - (1 + eIn) ** 2);
    const o0 = omega(directImageAtInfinity(6), directImageAtInfinity(15));
    const o1 = omega(
      outboundImageOffset(0, 1 / 6, 1.5 * Math.PI, M),
      outboundImageOffset(0, 1 / 15, 1.5 * Math.PI, M),
    );
    for (const [name, ours, quoted, unit] of [
      ['Omega_0 / Omega_S (eq. 50: 1.10)', o0 / omegaS, 1.1, 0.01],
      ['Omega_1 / Omega_0 (eq. 51: 0.017)', o1 / o0, 0.017, 0.001],
      ['Omega_1 / Omega_S (eq. 51: 0.019)', o1 / omegaS, 0.019, 0.001],
    ] as const) {
      measured(`published rings A7: ${name}`, ours);
      expect(
        measured(
          `published rings A7: ${name}, distance from the quoted value in units of its last digit`,
          Math.abs(ours - quoted) / unit,
        ),
      ).toBeLessThanOrEqual(1);
    }
  });
});

describe('Tsupko (2022) section III D: the n = 2 area of a face-on disk from 6 to 30 M', () => {
  it('his eq. (18) is "about 2.0%" from the exact area', () => {
    // Area pi (b_out^2 - b_in^2) of the n = 2 image, observer at infinity (sweep 5 pi / 2). The
    // tolerance is one unit of the quoted digit (0.1 percentage point), as for A7.
    const sweep = 2.5 * Math.PI;
    const area = (bIn: number, bOut: number) => Math.PI * (bOut * bOut - bIn * bIn);
    const exact = area(
      BC * (1 + outboundImageOffset(0, 1 / 6, sweep, M)),
      BC * (1 + outboundImageOffset(0, 1 / 30, sweep, M)),
    );
    const analytic = area(tsupkoImpactForSweep(6, sweep), tsupkoImpactForSweep(30, sweep));
    const relExact = (exact - analytic) / exact;
    const relAnalytic = (exact - analytic) / analytic;
    measured('published rings area: (exact - eq. 18) / exact', relExact);
    measured('published rings area: (exact - eq. 18) / eq. 18', relAnalytic);
    for (const rel of [relExact, relAnalytic]) {
      expect(
        measured(
          'published rings area: distance from 2.0% in units of 0.1%',
          Math.abs(rel - 0.02) / 0.001,
        ),
      ).toBeLessThanOrEqual(1);
    }
  });
});

describe('A8: shadow radius against the series of sin(psi) = (b_c / D) sqrt(1 - 2/D) (consistency check)', () => {
  it('psi D / b_c = 1 - t + 4t^2 - 14t^3 + 60.8t^4 - 272t^5 + R, t = M/D, for D from 1e2 to 1e6 M', () => {
    // Leading term: the papers' theta_sh = b_c / D_d (BK-T eq. 13 at eps = 0; Tsupko p. 3); the
    // rest is photonring's own static-observer formula. The series is exact in rationals (the
    // next coefficients are 9024/7, -6288, 31488, -803584/5); it alternates, and successive
    // coefficients grow by less than a factor of 6 (nearest singularity at t = -1/6), so for
    // t <= 0.01 each term is at most 0.06 of the one before and |R| <= (9024/7) t^6. Rounding: about 18 u in
    // psi D / b_c (14 u through shadowAngularRadius's atan2 form, taking Math.pow and Math.atan2
    // within 1 ulp, then 4 u for the product and b_c) and about 1 u in the series: 20 u.
    // The first omitted term bounds the remainder tightly (|R| approaches it as 1 - 4.9 M/D), so
    // the fraction of tolerance is close to 1 near D = 300 M by construction. The rounding is
    // checked on its own, after the t^6 and t^7 terms (what is left of the series is below
    // 31488 t^8 <= 3e-20 for D >= 1000 M).
    const floor = 20 * U;
    let worst = 0;
    let worstRounding = 0;
    for (let i = 0; i <= 4000; i++) {
      const D = 10 ** (2 + i / 1000);
      const t = M / D;
      const series = 1 - t * (1 - t * (4 - t * (14 - t * (60.8 - 272 * t))));
      const r = (shadowAngularRadius(D, M) * D) / BC - series;
      worst = Math.max(worst, Math.abs(r) / ((9024 / 7) * t ** 6 + floor));
      if (D >= 1000) {
        const rounding = Math.abs(r - (9024 / 7) * t ** 6 + 6288 * t ** 7);
        worstRounding = Math.max(worstRounding, rounding / U);
      }
    }
    expect(
      measured('published rings A8: |psi D / b_c - series| as a fraction of tolerance', worst),
    ).toBeLessThan(1);
    expect(
      measured(
        'published rings A8: rounding of psi D / b_c for D >= 1000 M, units of u',
        worstRounding,
      ),
    ).toBeLessThan(20);
  });
});
