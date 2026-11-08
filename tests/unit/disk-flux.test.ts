// The relativistic thin-disk flux of Page and Thorne (1974) for a Schwarzschild hole (Stage 8):
// against the paper's integral, eq. (12), against a second closed form (Mueller and Frauendiener
// 2012, eq. 11), and against its peak and limits. Geometric units G = c = 1; fluxes per unit
// rest-mass accretion rate. Near the ISCO the flux goes as (r - 6M)^2, so it is only as accurate
// as r - 6M: the rows closer than 1e-2 to the ISCO use M = 1 and 2, where 6M is exact in f64.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISK,
  assertDiskSettings,
  diskFluxHat,
  diskTemperatureFactor,
  diskTemperatureHat,
  pageThorneFlux,
  pageThornePeakRadius,
  type DiskSettings,
} from '../../src/physics/index.ts';
import { adaptiveSimpson, goldenSectionMax, relErr } from '../helpers/numeric.ts';
import { measured } from '../helpers/measured.ts';

/** Circular geodesics of the Schwarzschild metric: energy, angular momentum, angular velocity. */
function geodesics(M: number) {
  const E = (t: number) => (1 - (2 * M) / t) / Math.sqrt(1 - (3 * M) / t);
  const L = (t: number) => Math.sqrt(M * t) / Math.sqrt(1 - (3 * M) / t);
  const omega = (t: number) => Math.sqrt(M / t ** 3);
  // Derivatives by hand. dL/dr is written in u = r - 6M, so its zero at the ISCO is exact.
  const dLdr = (u: number) => (Math.sqrt(M) * u) / (2 * (3 * M + u) ** 1.5);
  const dOmegadr = (t: number) => -1.5 * Math.sqrt(M) * t ** -2.5;
  return { E, L, omega, dLdr, dOmegadr };
}

/**
 * Page and Thorne (1974), eqs. (11b), (12) and (15d) with Mdot = 1: F = f / (4 pi r) and
 * f = -Omega_,r (E - Omega L)^-2 Integral from 6M to r of (E - Omega L) L_,r dr. The integration
 * variable is u = r - 6M, so that L_,r keeps its precision near the ISCO.
 */
function fluxFromIntegral(r: number, M: number): number {
  const { E, L, omega, dLdr, dOmegadr } = geodesics(M);
  const isco = 6 * M;
  const integrand = (u: number) => {
    const t = isco + u;
    return (E(t) - omega(t) * L(t)) * dLdr(u);
  };
  const width = r - isco;
  const tol = 1e-15 * Math.abs(integrand(width)) * width;
  const integral = adaptiveSimpson(integrand, 0, width, tol);
  const f = (-dOmegadr(r) / (E(r) - omega(r) * L(r)) ** 2) * integral;
  return f / (4 * Math.PI * r);
}

/**
 * Mueller and Frauendiener (2012), eq. (11): F = F0 / ((R - 3/2) R^(5/2)) [sqrt R - sqrt3 +
 * (sqrt(3/2) / 2) ln((sqrt R + sqrt(3/2)) / (sqrt R - sqrt(3/2)) (sqrt3 - sqrt(3/2)) /
 * (sqrt3 + sqrt(3/2)))], R = r / r_s, r_s = 2M, F0 = 3 M Mdot / (8 pi r_s^3), Mdot = 1.
 */
function fluxMuellerFrauendiener(r: number, M: number): number {
  const rs = 2 * M;
  const R = r / rs;
  const F0 = (3 * M) / (8 * Math.PI * rs ** 3);
  const a = Math.sqrt(3 / 2);
  const sqrt3 = Math.sqrt(3);
  const sqrtR = Math.sqrt(R);
  const log = Math.log(((sqrtR + a) / (sqrtR - a)) * ((sqrt3 - a) / (sqrt3 + a)));
  return (F0 / ((R - 3 / 2) * R ** 2.5)) * (sqrtR - sqrt3 + (a / 2) * log);
}

/** The Newtonian thin disk with zero torque at 6M (Shakura and Sunyaev), the large-r oracle. */
function newtonianFlux(r: number, M: number): number {
  return ((3 * M) / (8 * Math.PI * r ** 3)) * (1 - Math.sqrt((6 * M) / r));
}

/**
 * r / r_isco of the comparison rows. The library sums artanh(z) - z as a series below z = 0.125,
 * which is r = 1.2263 r_isco; the rows 1.2, 1.226 and 1.23 sit on both sides of that switch, where
 * a series cut short would be furthest off.
 */
const NEAR_ISCO = [1 + 1e-9, 1 + 1e-6, 1 + 1e-3];
const AWAY = [1.01, 1.1, 1.2, 1.226, 1.23, 1.3, 1.5918, 2, 3.333, 10, 100, 1000];

describe('Page-Thorne flux against the paper and a second closed form', () => {
  it('the oracle derivatives match central differences', () => {
    for (const M of [1, 1.7]) {
      const { L, omega, dLdr, dOmegadr } = geodesics(M);
      for (const r of [7 * M, 10 * M, 40 * M]) {
        const h = 1e-5 * r;
        const dL = (L(r + h) - L(r - h)) / (2 * h);
        const dOmega = (omega(r + h) - omega(r - h)) / (2 * h);
        expect(relErr(dLdr(r - 6 * M), dL)).toBeLessThan(1e-8);
        expect(relErr(dOmegadr(r), dOmega)).toBeLessThan(1e-8);
      }
    }
  });

  const integralRows = [
    ...NEAR_ISCO.flatMap((k) => [1, 2].map((M) => [k, M] as const)),
    ...AWAY.flatMap((k) => [1, 1.7].map((M) => [k, M] as const)),
  ];
  it.each(integralRows)('r = %d r_isco, M = %d: equals the integral of eq. (12)', (k, M) => {
    const r = 6 * M * k;
    const err = relErr(pageThorneFlux(r, M), fluxFromIntegral(r, M));
    expect(measured('disk flux: against the integral of eq. (12), relative', err)).toBeLessThan(
      1e-12,
    );
  });

  // Eq. (11) cancels near the ISCO: against this library it is off by 9.3e-5 at 6M (1 + 1e-6),
  // 4.1e-11 at 6M (1 + 1e-3) and 9.5e-13 at 1.01 r_isco (M = 1, measured 2026-11-08). So only from
  // 1.1 r_isco.
  const closedRows = AWAY.filter((k) => k >= 1.1).flatMap((k) =>
    [1, 1.7].map((M) => [k, M] as const),
  );
  it.each(closedRows)('r = %d r_isco, M = %d: equals Mueller and Frauendiener eq. (11)', (k, M) => {
    const r = 6 * M * k;
    const err = relErr(pageThorneFlux(r, M), fluxMuellerFrauendiener(r, M));
    expect(
      measured('disk flux: against Mueller and Frauendiener eq. (11), relative', err),
    ).toBeLessThan(1e-12);
  });
});

describe('Page-Thorne flux: peak', () => {
  it('the peak radius and the peak flux equal their 70-digit values', () => {
    // The root of x (x^2 - 6) = (7 x^2 - 15) B(x), r = M x^2, and the flux there, computed from
    // eq. (15n) with 70 decimal digits (Python decimal, 2026-11-08): 9.5509280779438696 M and
    // 1.3678110819829865e-5 Mdot / M^2.
    const err = relErr(pageThornePeakRadius(1), 9.55092807794387);
    expect(
      measured('disk flux: peak radius against its 70-digit value, relative', err),
    ).toBeLessThan(1e-14);
    expect(relErr(pageThornePeakRadius(2.5), 2.5 * 9.55092807794387)).toBeLessThan(1e-14);
    const fMax = pageThorneFlux(pageThornePeakRadius(1), 1);
    expect(relErr(fMax, 1.3678110819829865e-5)).toBeLessThan(1e-14);
  });

  it.each([1, 1.7])('M = %d: the peak radius is where the flux and T-hat are largest', (M) => {
    const rPeak = pageThornePeakRadius(M);
    const fluxArgMax = goldenSectionMax((r) => pageThorneFlux(r, M), 6 * M, 30 * M, 1e-12 * M);
    const tArgMax = goldenSectionMax((r) => diskTemperatureHat(r, M), 6 * M, 30 * M, 1e-12 * M);
    const err = Math.max(relErr(fluxArgMax, rPeak), relErr(tArgMax, rPeak));
    expect(
      measured('disk flux: peak radius against a golden-section search, relative', err),
    ).toBeLessThan(1e-6);
    expect(Math.abs(diskFluxHat(rPeak, M) - 1)).toBeLessThan(1e-15);
    expect(Math.abs(diskTemperatureHat(rPeak, M) - 1)).toBeLessThan(1e-15);
  });

  it('peaks where Mueller and Frauendiener (2012) print it', () => {
    const rPeak = pageThornePeakRadius(1);
    const F0 = 3 / (8 * Math.PI * 2 ** 3);
    // They print F_max / F0 = 9.167e-4 at R_max = 4.776 (R = r / r_s). The flux agrees to its
    // printed rounding (5e-8). The root of the peak equation is R = 4.775464, 5.4e-4 from 4.776:
    // more than the 5e-4 that rounding to three decimals allows. The root is pinned by the two
    // tests above (a 70-digit value and a direct search), so the printed radius is checked only
    // to 1e-3, one unit of its last digit (twice the 5e-4 that rounding allows). How they found
    // their radius is not stated.
    expect(Math.abs(rPeak / 2 - 4.776)).toBeLessThan(1e-3);
    expect(Math.abs(pageThorneFlux(rPeak, 1) / F0 - 9.167e-4)).toBeLessThan(5e-8);
  });

  it('the normalised profiles are F / F(r_peak) and its fourth root', () => {
    for (const M of [1, 1.7]) {
      const fMax = pageThorneFlux(pageThornePeakRadius(M), M);
      for (const r of [6.01 * M, 7 * M, 12 * M, 20 * M, 1000 * M]) {
        expect(relErr(diskFluxHat(r, M), pageThorneFlux(r, M) / fMax)).toBeLessThan(1e-14);
        expect(relErr(diskTemperatureHat(r, M), diskFluxHat(r, M) ** 0.25)).toBeLessThan(1e-15);
      }
    }
  });
});

describe('Page-Thorne flux: limits and shape', () => {
  it.each([1, 2])('M = %d: zero torque at the ISCO, a double zero', (M) => {
    for (const r of [6 * M, 6 * M * (1 - 1e-9), 5.99 * M, 5.95 * M, 5.9 * M, 3 * M, 0]) {
      expect(pageThorneFlux(r, M)).toBe(0);
      expect(diskFluxHat(r, M)).toBe(0);
      expect(diskTemperatureHat(r, M)).toBe(0);
    }
    const justOutside = pageThorneFlux(6 * M * (1 + 1e-12), M);
    expect(Number.isFinite(justOutside)).toBe(true);
    expect(justOutside).toBeGreaterThan(0);
    // F = Mdot (r - 6M)^2 / (20736 pi M^4) + O((r - 6M)^3), from B ~ x0 d^2 / 3.
    const r = 6 * M + 1e-7 * M;
    const d = r - 6 * M; // exact: r and 6M are within a factor of two (Sterbenz)
    const err = relErr(pageThorneFlux(r, M) / (d * d), 1 / (20736 * Math.PI * M ** 4));
    expect(measured('disk flux: F / (r - 6M)^2 at r - 6M = 1e-7 M, relative', err)).toBeLessThan(
      1e-6,
    );
  });

  it.each([1, 1.7])('M = %d: approaches the Newtonian thin disk far out', (M) => {
    const at1e8 = Math.abs(pageThorneFlux(1e8 * M, M) / newtonianFlux(1e8 * M, M) - 1);
    expect(at1e8).toBeLessThan(2e-4);
    // F / F_N = 1 + (sqrt3 / 2) ln(3 - 2 sqrt2) sqrt(M / r) + O(M / r).
    const r = 1e10 * M;
    const coefficient = (Math.sqrt(3) / 2) * Math.log(3 - 2 * Math.sqrt(2));
    const ratio = pageThorneFlux(r, M) / newtonianFlux(r, M);
    const err = Math.abs((ratio - 1) * Math.sqrt(r / M) - coefficient);
    expect(
      measured('disk flux: sqrt(M / r) term of F / F_N at 1e10 M, absolute', err),
    ).toBeLessThan(1e-4);
    expect(Math.abs((pageThorneFlux(r, M) * r ** 3 * 8 * Math.PI) / (3 * M) - 1)).toBeLessThan(
      1e-4,
    );
  });

  it('rises from the ISCO to the peak and falls beyond it', () => {
    const M = 1;
    const rPeak = pageThornePeakRadius(M);
    const rising: number[] = [];
    for (let d = 6e-9; 6 + d < rPeak * (1 - 1e-6); d *= 1.01) rising.push(6 + d);
    rising.push(rPeak * (1 - 1e-6));
    const falling: number[] = [];
    for (let r = rPeak * (1 + 1e-6); r < 1e6; r *= 1.01) falling.push(r);
    falling.push(1e6);
    const flux = (rs: number[]) => rs.map((r) => pageThorneFlux(r, M));
    const up = flux(rising);
    const down = flux(falling);
    expect(up.every((v, i) => i === 0 || v > up[i - 1]!)).toBe(true);
    expect(down.every((v, i) => i === 0 || v < down[i - 1]!)).toBe(true);
    expect(up[up.length - 1]).toBeLessThan(pageThorneFlux(rPeak, M));
    expect(down[0]).toBeLessThan(pageThorneFlux(rPeak, M));
  });

  it.each([0.5, 2, 7.3])('M = %d: F(r M, M) M^2 = F(r, 1) and T-hat(r M, M) = T-hat(r, 1)', (M) => {
    let worst = 0;
    for (const r of [7, pageThornePeakRadius(1), 12, 20, 100, 1e4]) {
      worst = Math.max(
        worst,
        relErr(pageThorneFlux(r * M, M) * M * M, pageThorneFlux(r, 1)),
        relErr(diskTemperatureHat(r * M, M), diskTemperatureHat(r, 1)),
      );
    }
    expect(measured('disk flux: mass scaling, relative', worst)).toBeLessThan(1e-14);
  });
});

describe('the smooth factor C(s) for the GPU table', () => {
  const fMax = () => pageThorneFlux(pageThornePeakRadius(1), 1);

  it('has the limits C(0) = (576 pi F_max)^(-1/4) and C(1) = sqrt2 C(0)', () => {
    const c0 = (576 * Math.PI * fMax()) ** -0.25;
    expect(relErr(diskTemperatureFactor(0), c0)).toBeLessThan(1e-14);
    expect(relErr(diskTemperatureFactor(1), Math.SQRT2 * c0)).toBeLessThan(1e-14);
    // The same limits at 70 digits (Python decimal, from eq. 15n).
    expect(relErr(diskTemperatureFactor(0), 2.5211598452300006)).toBeLessThan(1e-14);
    expect(relErr(diskTemperatureFactor(1), 3.56545844603472)).toBeLessThan(1e-14);
  });

  it('is continuous at both ends', () => {
    const near0 = relErr(diskTemperatureFactor(1e-9), diskTemperatureFactor(0));
    const near1 = relErr(diskTemperatureFactor(1 - 1e-9), diskTemperatureFactor(1));
    expect(measured('disk table factor: C(1e-9) against C(0), relative', near0)).toBeLessThan(1e-8);
    expect(measured('disk table factor: C(1 - 1e-9) against C(1), relative', near1)).toBeLessThan(
      1e-8,
    );
  });

  it('times s^(3/2) (1 - s)^(1/2) gives T-hat at r = 6M / s^2, for s up to 0.999', () => {
    // Above s = 0.999 the radius 6M / s^2 rounds in f64 and T-hat there loses digits, as the
    // flux is only as accurate as r - 6M, so the identity is checked only up to 0.999.
    let worst = 0;
    for (const M of [1, 2]) {
      for (let i = 1; i <= 999; i++) {
        const s = i / 1000;
        const lhs = s ** 1.5 * Math.sqrt(1 - s) * diskTemperatureFactor(s);
        worst = Math.max(worst, relErr(lhs, diskTemperatureHat((6 * M) / (s * s), M)));
      }
    }
    expect(
      measured('disk table factor: identity with T-hat, s <= 0.999, relative', worst),
    ).toBeLessThan(1e-13);
  });

  it('gives T-hat at small s too, where the table has its first nodes after s = 0', () => {
    // C(s) = C(0) (1 + 0.094 s + ...), so near s = 0 it differs from C(0) by about 1e-4 at the
    // table's second node, s = 1/1023, which lies at r = 6.3e6 M.
    for (const M of [1, 2]) {
      for (const s of [1e-6, 1e-5, 1e-4, 5e-4, 1 / 1023, 2 / 1023, 1e-2]) {
        const lhs = s ** 1.5 * Math.sqrt(1 - s) * diskTemperatureFactor(s);
        expect(relErr(lhs, diskTemperatureHat((6 * M) / (s * s), M))).toBeLessThan(1e-13);
      }
    }
  });
});

describe('Page-Thorne input checks', () => {
  it('rejects a mass that is not positive and finite', () => {
    for (const M of [0, -1, NaN, Infinity]) {
      expect(() => pageThorneFlux(10, M)).toThrow(RangeError);
      expect(() => pageThornePeakRadius(M)).toThrow(RangeError);
      expect(() => diskFluxHat(10, M)).toThrow(RangeError);
      expect(() => diskTemperatureHat(10, M)).toThrow(RangeError);
    }
  });

  it('rejects a radius that is not a number; an infinite radius gives 0', () => {
    expect(() => pageThorneFlux(NaN, 1)).toThrow(RangeError);
    expect(() => diskTemperatureHat(NaN, 1)).toThrow(RangeError);
    expect(pageThorneFlux(Infinity, 1)).toBe(0);
    expect(diskFluxHat(Infinity, 1)).toBe(0);
    expect(diskTemperatureHat(Infinity, 1)).toBe(0);
  });

  it('accepts s in [0, 1] only for C(s)', () => {
    for (const s of [-1e-9, 1 + 1e-9, NaN]) {
      expect(() => diskTemperatureFactor(s)).toThrow(RangeError);
    }
  });
});

describe('disk settings check (assertDiskSettings)', () => {
  it('accepts the default disk, a disk at the ISCO of other masses and a disk cut at 7M', () => {
    expect(() => assertDiskSettings(DEFAULT_DISK, 1)).not.toThrow();
    expect(() => assertDiskSettings({ ...DEFAULT_DISK, rIn: 12, rOut: 40 }, 2)).not.toThrow();
    expect(() =>
      assertDiskSettings({ ...DEFAULT_DISK, rIn: 6 * 1.7, rOut: 34 }, 1.7),
    ).not.toThrow();
    expect(() => assertDiskSettings({ ...DEFAULT_DISK, rIn: 7 }, 1)).not.toThrow();
  });

  const rejected: [string, Partial<DiskSettings>, number][] = [
    ['an inner edge inside the ISCO', { rIn: 5.9 }, 1],
    ['an inner edge inside the ISCO of M = 2', { rIn: 11.9, rOut: 40 }, 2],
    ['M = 0', {}, 0],
    ['a negative M', {}, -1],
    ['an M that is not a number', {}, NaN],
    ['an infinite M', {}, Infinity],
    ['an outer edge at the inner edge', { rOut: 6 }, 1],
    ['an outer edge inside the inner edge', { rIn: 8, rOut: 7 }, 1],
    ['an infinite outer edge', { rOut: Infinity }, 1],
    ['an inner edge that is not a number', { rIn: NaN }, 1],
    ['an outer edge that is not a number', { rOut: NaN }, 1],
    ['opacity below 0', { opacity: -0.1 }, 1],
    ['opacity above 1', { opacity: 1.1 }, 1],
    ['opacity that is not a number', { opacity: NaN }, 1],
    ['a peak temperature of 0', { peakTemperature: 0 }, 1],
    ['a negative peak temperature', { peakTemperature: -6500 }, 1],
    ['a peak temperature that is not a number', { peakTemperature: NaN }, 1],
    ['an infinite peak temperature', { peakTemperature: Infinity }, 1],
  ];
  it.each(rejected)('rejects %s', (_, patch, M) => {
    expect(() => assertDiskSettings({ ...DEFAULT_DISK, ...patch }, M)).toThrow(RangeError);
  });
});
