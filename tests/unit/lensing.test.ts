// Lensed images of circles in the disk plane (Stage 4 overlays): the swept angle of plunging
// photons and the view angle at which a static observer sees a ring point after a given orbital
// sweep. Checked against an independent quadrature, the Binet integrator and the exact
// reference of tests/helpers/reference.ts. Derivation: docs/PHYSICS.md, sections 6a and 8a.
import { describe, expect, it } from 'vitest';
import {
  criticalImpactParameter,
  f64,
  integrateBinet,
  orbitPolynomial,
  orbitRoots,
  ringImageAngle,
  shadowAngularRadius,
  sweptAngleElliptic,
  sweptAnglePlunging,
  sweptAngleQuadrature,
} from '../../src/physics/index.ts';
import { adaptiveSimpson, relErr } from '../helpers/numeric.ts';
import { exactRadiusAtAngle } from '../helpers/reference.ts';

const M = 1;
const BC = criticalImpactParameter(M);
const UC = 1 / (3 * M);

/** 1/sqrt(P) integrated by adaptive Simpson, split at u = 1/(3M) where P is smallest. */
function simpsonSwept(b: number, uA: number, uB: number): number {
  const f = (u: number) => 1 / Math.sqrt(orbitPolynomial(u, b, M));
  if (uA < UC && UC < uB) return adaptiveSimpson(f, uA, UC) + adaptiveSimpson(f, UC, uB);
  return adaptiveSimpson(f, uA, uB);
}

describe('swept angle of plunging photons (b < b_c), any interval', () => {
  const intervals: [number, number][] = [
    [1 / 200, 1 / 2],
    [1 / 30, 1 / 3],
    [1 / 5, 0.55],
  ];
  for (const ratio of [0.3, 0.9, 0.99, 0.999, 0.999999]) {
    it(`b = ${ratio} b_c: agrees with adaptive Simpson to 1e-10`, () => {
      for (const [uA, uB] of intervals) {
        const b = ratio * BC;
        expect(relErr(sweptAnglePlunging(b, uA, uB, M), simpsonSwept(b, uA, uB))).toBeLessThan(
          1e-10,
        );
      }
    });
  }

  it('agrees with the existing quadrature where both apply (u <= 1/(4M))', () => {
    for (const ratio of [0.2, 0.7, 0.99]) {
      const b = ratio * BC;
      expect(
        relErr(
          sweptAnglePlunging(b, 1 / 100, 1 / 4, M),
          sweptAngleQuadrature(b, 1 / 100, 1 / 4, M),
        ),
      ).toBeLessThan(1e-12);
    }
  });

  it('is continuous with the scattering swept angle across b_c', () => {
    const below = sweptAnglePlunging(BC * (1 - 1e-9), 1 / 30, 1 / 6, M);
    const above = sweptAngleElliptic(BC * (1 + 1e-9), 1 / 30, 1 / 6, M);
    expect(Math.abs(below - above)).toBeLessThan(1e-6);
  });

  it.each([
    ['b at b_c', BC, 0.1, 0.2],
    ['b above b_c', 1.1 * BC, 0.1, 0.2],
    ['an empty interval', BC / 2, 0.2, 0.2],
    ['a reversed interval', BC / 2, 0.3, 0.2],
    ['a negative start', BC / 2, -0.1, 0.2],
    ['a non-finite end', BC / 2, 0.1, Infinity],
    ['a non-finite b', NaN, 0.1, 0.2],
  ])('rejects %s', (_name, b, uA, uB) => {
    expect(() => sweptAnglePlunging(b, uA, uB, M)).toThrow(RangeError);
  });
});

/**
 * Radius reached after the orbital sweep `sweep` by the ray leaving a static observer at r_o at
 * angle alpha from the direction to the hole, by the Binet integrator (f64, fine step). Capture
 * is set below R but never above 3M, where captured rays could still turn round. Returns 0 if
 * the ray is captured first and Infinity if it escapes first.
 */
function binetRadiusAt(rObs: number, R: number, alpha: number, sweep: number, dphi = 5e-4): number {
  const u0 = 1 / rObs;
  const w0 = u0 * Math.sqrt(1 - 2 * M * u0) * (Math.cos(alpha) / Math.sin(alpha));
  const res = integrateBinet(M, u0, w0, {
    round: f64,
    dphi,
    maxSteps: Math.ceil(sweep / dphi) + 10,
    uCapture: 1 / Math.min(3 * M, 0.9 * R),
    firstCrossing: sweep,
  });
  const c = res.crossings[0];
  if (c && c.phi === sweep) return 1 / c.u;
  return res.termination === 'captured' ? 0 : Infinity;
}

describe('view angle of a ring point after a given sweep', () => {
  const observers = [5, 5.5, 6, 6.5, 10, 30, 200];
  const rings = [2, 3, 6];
  const sweeps = [0.05, 0.5, 1, 2, Math.PI, 4, 5.5, 2 * Math.PI];

  for (const rObs of observers) {
    it(`r_o = ${rObs} M: the traced ray reaches R at that sweep (1e-9)`, () => {
      for (const R of rings) {
        for (const sweep of sweeps) {
          const alpha = ringImageAngle(rObs, R, sweep, M);
          expect(alpha).toBeGreaterThan(0);
          expect(alpha).toBeLessThan(Math.PI);
          expect(relErr(binetRadiusAt(rObs, R, alpha, sweep), R)).toBeLessThan(1e-9);
        }
      }
    });
  }

  it('r = 6M images agree with the exact elliptic-integral reference (1e-9)', () => {
    let checked = 0;
    let skipped = 0;
    for (const rObs of observers) {
      for (const sweep of sweeps) {
        const alpha = ringImageAngle(rObs, 6, sweep, M);
        // The reference measures the angle from the outward radial direction.
        const r = exactRadiusAtAngle(rObs, Math.PI - alpha, sweep, M);
        if (Number.isNaN(r)) {
          // The reference stops inside 4M for b <= b_c; such a ray counts as below R.
          skipped++;
          continue;
        }
        expect(relErr(r, 6)).toBeLessThan(1e-9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(skipped).toBeLessThan(checked);
  });

  it('does not throw at the fold between the inbound and outbound branches', () => {
    const rObs = 30;
    const R = 6;
    const bTurn = R / Math.sqrt(1 - (2 * M) / R);
    const phiStar = sweptAngleElliptic(bTurn, 1 / rObs, orbitRoots(bTurn, M).u2, M);
    for (const sweep of [phiStar - 1e-12, phiStar, phiStar + 1e-12]) {
      const alpha = ringImageAngle(rObs, R, sweep, M);
      expect(relErr(binetRadiusAt(rObs, R, alpha, sweep), R)).toBeLessThan(1e-8);
    }
  });

  it('has the right limits for small and large sweeps', () => {
    // A tiny sweep is a nearly radial ray: inward for R < r_o, outward for R > r_o.
    expect(ringImageAngle(30, 6, 1e-6, M)).toBeLessThan(1e-5);
    expect(ringImageAngle(5, 6, 1e-6, M)).toBeGreaterThan(Math.PI - 1e-4);
    // R = r_o: the ray leaves sideways and comes back to the same radius.
    expect(Math.abs(ringImageAngle(6, 6, 1e-4, M) - Math.PI / 2)).toBeLessThan(1e-3);
    // Many windings: the image converges onto the shadow edge.
    for (const [rObs, R] of [
      [30, 2],
      [30, 6],
      [5, 6],
      [200, 3],
    ] as const) {
      const psi = shadowAngularRadius(rObs, M);
      expect(Math.abs(ringImageAngle(rObs, R, 4 * Math.PI, M) - psi)).toBeLessThan(1e-3 * psi);
    }
  });

  it('images of rings at or inside 3M lie inside the shadow edge', () => {
    for (const rObs of observers) {
      const psi = shadowAngularRadius(rObs, M);
      for (const R of [2, 2.5, 3]) {
        for (const sweep of sweeps) expect(ringImageAngle(rObs, R, sweep, M)).toBeLessThan(psi);
      }
    }
  });

  it('the image is unique: r(sweep) - R changes sign once over all view angles', () => {
    const cases: [number, number, number][] = [
      [30, 6, Math.PI / 2],
      [30, 6, 1.5 * Math.PI],
      [30, 2, Math.PI],
      [5, 6, 2],
      [6, 6, Math.PI],
      [200, 3, 2 * Math.PI],
    ];
    for (const [rObs, R, sweep] of cases) {
      let changes = 0;
      let last = 0;
      const n = 2000;
      for (let i = 1; i < n; i++) {
        const alpha = (Math.PI * i) / n;
        const s = Math.sign(binetRadiusAt(rObs, R, alpha, sweep, 0.0125) - R);
        if (s !== 0 && last !== 0 && s !== last) changes++;
        if (s !== 0) last = s;
      }
      expect(changes).toBe(1);
    }
  });

  it.each([
    ['a non-finite observer distance', NaN, 6, 1],
    ['an observer on the horizon', 2, 6, 1],
    ['a ring inside the horizon', 30, 1.9, 1],
    ['a zero sweep', 30, 6, 0],
    ['a negative sweep', 30, 6, -1],
    ['a sweep beyond 4 pi', 30, 6, 4 * Math.PI + 0.1],
    ['a non-finite sweep', 30, 6, Infinity],
  ])('rejects %s', (_name, rObs, R, sweep) => {
    expect(() => ringImageAngle(rObs, R, sweep, M)).toThrow(RangeError);
  });
});
