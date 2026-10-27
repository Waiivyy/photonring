// Table-driven analytic checks for the f64 physics reference (spec section 10, items 1, 2, 5, 6).
// Geometric units G = c = 1. Most rows use M = 1; a few repeat with another mass to catch
// formulas that only work when M happens to be 1.
import { describe, expect, it } from 'vitest';
import {
  blackbodyColour,
  circularOrbitAngularMomentumSq,
  circularOrbitEmitter,
  compositeDisk,
  criticalImpactParameter,
  deflectionAngleElliptic,
  deflectionAngleQuadrature,
  diskTemperature,
  diskTemperatureScale,
  horizonRadius,
  impactParameterFromLocalAngle,
  iscoRadius,
  localDirectionToEuclidean,
  maxImpactParameterAt,
  orbitPolynomial,
  orbitRoots,
  photonPotential,
  photonSphereRadius,
  redshiftFactor,
  shadowAngularRadius,
  staticEmitter,
  staticObserverFactor,
  strongFieldDeflection,
  sweptAngleElliptic,
  sweptAngleQuadrature,
  weakFieldDeflection,
} from '../../src/physics/index.ts';
import {
  adaptiveSimpson,
  goldenSectionMax,
  goldenSectionMin,
  relErr,
  slope,
} from '../helpers/numeric.ts';

const SQRT3 = Math.sqrt(3);

describe('1. analytic constants', () => {
  it.each([1, 2.5])('closed forms scale with M = %d', (M) => {
    expect(horizonRadius(M)).toBe(2 * M);
    expect(photonSphereRadius(M)).toBe(3 * M);
    expect(iscoRadius(M)).toBe(6 * M);
    expect(relErr(criticalImpactParameter(M), 5.196152422706632 * M)).toBeLessThan(1e-15);
  });

  it.each([1, 2.5])(
    'photon sphere is the maximum of the photon potential (M = %d), hence unstable',
    (M) => {
      const rMax = goldenSectionMax((r) => photonPotential(r, M), 2.2 * M, 10 * M);
      expect(Math.abs(rMax - photonSphereRadius(M))).toBeLessThan(1e-6 * M);
      const h = 1e-3 * M;
      const r = photonSphereRadius(M);
      const second =
        (photonPotential(r + h, M) - 2 * photonPotential(r, M) + photonPotential(r - h, M)) /
        (h * h);
      expect(second).toBeLessThan(0);
    },
  );

  it.each([1, 2.5])('b_c = V_max^(-1/2) and u = 1/3M is a double root at b_c (M = %d)', (M) => {
    const bc = criticalImpactParameter(M);
    expect(relErr(1 / Math.sqrt(photonPotential(3 * M, M)), bc)).toBeLessThan(1e-15);
    // Circular null orbit: (du/dphi)^2 and its u-derivative both vanish at u = 1/3M.
    const u = 1 / (3 * M);
    const du = 1e-6 / M;
    expect(Math.abs(orbitPolynomial(u, bc, M)) * M * M).toBeLessThan(1e-15);
    const deriv = (orbitPolynomial(u + du, bc, M) - orbitPolynomial(u - du, bc, M)) / (2 * du);
    expect(Math.abs(deriv) * M).toBeLessThan(1e-9);
  });

  it.each([1, 2.5])('ISCO is the minimum of the circular-orbit angular momentum (M = %d)', (M) => {
    const rMin = goldenSectionMin((r) => circularOrbitAngularMomentumSq(r, M), 3.5 * M, 30 * M);
    expect(Math.abs(rMin - iscoRadius(M))).toBeLessThan(1e-5 * M);
  });
});

describe('2a. orbit polynomial roots', () => {
  const rows = [1 + 1e-9, 1 + 1e-6, 1.0001, 1.01, 1.5, 2, 10, 1e3, 1e5];
  it.each(rows)('b = %d b_c: ordered, Vieta relations, accurate differences', (ratio) => {
    const M = 1;
    const b = ratio * criticalImpactParameter(M);
    const r = orbitRoots(b, M);
    expect(r.u1).toBeLessThan(0);
    expect(r.u2).toBeGreaterThan(0);
    expect(r.u2).toBeLessThanOrEqual(1 / (3 * M));
    expect(r.u3).toBeGreaterThanOrEqual(1 / (3 * M));
    expect(r.u3).toBeLessThan(1 / (2 * M));
    // P(u) = 2M u^3 - u^2 + 1/b^2 = 2M (u - u1)(u - u2)(u - u3)
    expect(relErr(r.u1 + r.u2 + r.u3, 1 / (2 * M))).toBeLessThan(1e-14);
    expect(relErr(r.u1 * r.u2 * r.u3, -1 / (2 * M * b * b))).toBeLessThan(1e-12);
    const pair = r.u1 * r.u2 + r.u1 * r.u3 + r.u2 * r.u3;
    expect(Math.abs(pair)).toBeLessThan(1e-14 * Math.abs(r.u1 * r.u3));
    expect(relErr(r.d21, r.u2 - r.u1)).toBeLessThan(1e-12);
    expect(relErr(r.d31, r.u3 - r.u1)).toBeLessThan(1e-14);
    expect(Math.abs(r.d32 - (r.u3 - r.u2))).toBeLessThan(1e-15);
    expect(Math.abs(r.q0 - (1 / (3 * M) - r.u2))).toBeLessThan(1e-15);
  });

  it('rejects b <= b_c, where there is no turning point', () => {
    expect(() => orbitRoots(criticalImpactParameter(1), 1)).toThrow(RangeError);
    expect(() => orbitRoots(4, 1)).toThrow(RangeError);
  });
});

describe('2b. deflection angle: quadrature versus elliptic integrals', () => {
  const rows = [1 + 1e-8, 1 + 1e-6, 1.0001, 1.001, 1.01, 1.02, 1.1, 1.5, 2, 5, 10, 100, 1000];
  it.each(rows)('b = %d b_c: methods agree to 1e-11', (ratio) => {
    for (const M of [1, 2.5]) {
      const b = ratio * criticalImpactParameter(M);
      const q = deflectionAngleQuadrature(b, M);
      const e = deflectionAngleElliptic(b, M);
      expect(q).toBeGreaterThan(0);
      expect(relErr(q, e)).toBeLessThan(1e-11);
    }
  });

  it.each([
    [8, 0, 'turning'],
    [8, 0.02, 'turning'],
    [8, 0, 0.05],
    [8, 0.05, 0.1],
    [5.3, 0.1, 'turning'],
    [50, 0.001, 0.015],
  ] as const)('swept angle for b = %d on [%d, %s]: methods agree', (b, uA, uBSpec) => {
    const M = 1;
    const uB = uBSpec === 'turning' ? orbitRoots(b, M).u2 : uBSpec;
    const q = sweptAngleQuadrature(b, uA, uB, M);
    const e = sweptAngleElliptic(b, uA, uB, M);
    expect(relErr(q, e)).toBeLessThan(1e-11);
  });

  it('swept angle without a turning point (b < b_c, outward ray) matches adaptive Simpson', () => {
    const M = 1;
    for (const b of [0.5, 2, 5]) {
      const u0 = 1 / 30;
      const simpson = adaptiveSimpson((u) => 1 / Math.sqrt(orbitPolynomial(u, b, M)), 0, u0);
      expect(relErr(sweptAngleQuadrature(b, 0, u0, M), simpson)).toBeLessThan(1e-11);
    }
  });

  it('the full deflection is twice the swept angle to the turning point, minus pi', () => {
    const b = 7.5;
    const half = sweptAngleQuadrature(b, 0, orbitRoots(b, 1).u2, 1);
    expect(relErr(2 * half - Math.PI, deflectionAngleQuadrature(b, 1))).toBeLessThan(1e-13);
  });
});

describe('2c. deflection angle: weak and strong field limits', () => {
  it('the weak-field series is the Keeton-Petters expansion', () => {
    const b = 40;
    expect(weakFieldDeflection(b, 1, 1)).toBe(4 / b);
    expect(
      relErr(weakFieldDeflection(b, 1, 3), 4 / b + (15 * Math.PI) / 4 / b ** 2 + 128 / 3 / b ** 3),
    ).toBeLessThan(1e-15);
  });

  it.each([100, 200, 500, 1000])(
    'b = %d M: remainder after three terms is the fourth term, (3465 pi / 64)(M/b)^4',
    (b) => {
      const alpha = deflectionAngleQuadrature(b, 1);
      const remainder = alpha - weakFieldDeflection(b, 1, 3);
      const fourth = ((3465 * Math.PI) / 64) * b ** -4;
      expect(remainder / fourth).toBeGreaterThan(0.95);
      expect(remainder / fourth).toBeLessThan(1.06);
    },
  );

  it('(alpha - 4M/b) b^2 / M^2 approaches 15 pi / 4', () => {
    const b = 2000;
    const scaled = (deflectionAngleQuadrature(b, 1) - 4 / b) * b * b;
    expect(relErr(scaled, (15 * Math.PI) / 4)).toBeLessThan(2e-3);
  });

  it('Bozza (2002) strong-field coefficients: abar = 1, bbar = ln[216(7 - 4 sqrt 3)] - pi', () => {
    const bc = criticalImpactParameter(1);
    expect(strongFieldDeflection(bc * 1.5, 1)).toBeCloseTo(
      -Math.log(0.5) + Math.log(216 * (7 - 4 * SQRT3)) - Math.PI,
      14,
    );
    expect(Math.log(216 * (7 - 4 * SQRT3)) - Math.PI).toBeCloseTo(-0.4002, 4);
  });

  it('the exact deflection converges to the strong-field law as b -> b_c', () => {
    const bc = criticalImpactParameter(1);
    const eps = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7];
    const errs = eps.map((e) => {
      const b = bc * (1 + e);
      return Math.abs(deflectionAngleElliptic(b, 1) - strongFieldDeflection(b, 1));
    });
    for (let i = 1; i < errs.length; i++) {
      expect(errs[i]).toBeLessThan(errs[i - 1] as number);
    }
    expect(errs[errs.length - 1]).toBeLessThan(1e-5);
    const p = slope(eps.map(Math.log), errs.map(Math.log));
    expect(p).toBeGreaterThan(0.8);
    expect(p).toBeLessThan(1.2);
  });
});

describe('6a. shadow angular radius for a static observer at r_o', () => {
  const radii = [3.5, 5, 10, 30, 100, 200, 1000];

  it.each(radii)('r_o = %d M: the shadow edge maps back to b = b_c in the local frame', (ro) => {
    const psi = shadowAngularRadius(ro, 1);
    expect(
      relErr(impactParameterFromLocalAngle(ro, psi, 1), criticalImpactParameter(1)),
    ).toBeLessThan(1e-13);
  });

  it.each(radii)(
    'r_o = %d M: the Euclidean initial velocity reproduces b = b_c from its energy integral',
    (ro) => {
      // Local direction at angle psi from the outward radial, in the x-y plane, observer on +x.
      const psi = shadowAngularRadius(ro, 1);
      const v = localDirectionToEuclidean([ro, 0, 0], [Math.cos(psi), Math.sin(psi), 0], 1);
      const h = Math.abs(ro * v[1]);
      const speed2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      // 1/b^2 = |x'|^2 / h^2 - 2M / r^3 (derived in docs/PHYSICS.md)
      const b = 1 / Math.sqrt(speed2 / (h * h) - 2 / ro ** 3);
      expect(relErr(b, criticalImpactParameter(1))).toBeLessThan(1e-13);
    },
  );

  it('measured from the direction to the hole, the shadow is a quarter sphere at r_o = 3M', () => {
    expect(shadowAngularRadius(3, 1)).toBeCloseTo(Math.PI / 2, 12);
    expect(shadowAngularRadius(2.5, 1)).toBeGreaterThan(Math.PI / 2);
    expect(shadowAngularRadius(3.5, 1)).toBeLessThan(Math.PI / 2);
  });

  it('differs from the naive b_c / r_o and approaches it far away', () => {
    const naive = (ro: number) => Math.asin(criticalImpactParameter(1) / ro);
    expect(relErr(shadowAngularRadius(30, 1), naive(30))).toBeGreaterThan(0.03);
    expect(relErr(shadowAngularRadius(1e5, 1), naive(1e5))).toBeLessThan(2e-5);
  });

  it('rejects observers on or inside the horizon', () => {
    expect(() => shadowAngularRadius(2, 1)).toThrow(RangeError);
    expect(() => shadowAngularRadius(1, 1)).toThrow(RangeError);
  });
});

describe('5. redshift factor g = nu_obs / nu_emit', () => {
  const radii = [6, 7, 10, 20, 100];

  it.each(radii)('r = %d M: face-on disk (L_z = 0) gives sqrt(1 - 3M/r)', (r) => {
    expect(
      relErr(redshiftFactor(circularOrbitEmitter(r, 1), 0), Math.sqrt(1 - 3 / r)),
    ).toBeLessThan(1e-15);
  });

  it.each(radii)('r = %d M: static emitter gives sqrt(1 - 2M/r) for any L_z', (r) => {
    for (const lz of [-5, 0, 3]) {
      expect(relErr(redshiftFactor(staticEmitter(r, 1), lz), Math.sqrt(1 - 2 / r))).toBeLessThan(
        1e-15,
      );
    }
  });

  it.each(radii)('r = %d M: approaching and receding sides bracket the face-on value', (r) => {
    const em = circularOrbitEmitter(r, 1);
    const lz = 0.9 * maxImpactParameterAt(r, 1);
    const faceOn = redshiftFactor(em, 0);
    expect(redshiftFactor(em, lz)).toBeGreaterThan(faceOn);
    expect(redshiftFactor(em, -lz)).toBeLessThan(faceOn);
  });

  it('g is positive and finite for every allowed L_z from the ISCO to 1000M', () => {
    let gMax = 0;
    for (let r = 6; r <= 1000; r *= 1.07) {
      const em = circularOrbitEmitter(r, 1);
      const bMax = maxImpactParameterAt(r, 1);
      for (let k = -20; k <= 20; k++) {
        const g = redshiftFactor(em, (k / 20) * bMax);
        expect(Number.isFinite(g)).toBe(true);
        expect(g).toBeGreaterThan(0);
        gMax = Math.max(gMax, g);
      }
    }
    expect(gMax).toBeLessThan(2);
  });

  it('static emitter seen by a static observer: g = sqrt((1 - 2M/r_e) / (1 - 2M/r_o))', () => {
    for (const [re, ro] of [
      [6, 30],
      [3, 5],
      [10, 10],
      [50, 8],
    ] as const) {
      const g = redshiftFactor(staticEmitter(re, 1), 0) * staticObserverFactor(ro, 1);
      expect(relErr(g, Math.sqrt((1 - 2 / re) / (1 - 2 / ro)))).toBeLessThan(1e-15);
    }
  });

  it('rejects circular orbits at or inside the photon sphere', () => {
    expect(() => circularOrbitEmitter(3, 1)).toThrow(RangeError);
  });
});

describe('disk temperature profile (toy model)', () => {
  it('vanishes at the inner edge and peaks at r = (49/36) r_in', () => {
    const rIn = 6;
    expect(diskTemperature(rIn, rIn)).toBe(0);
    const peak = goldenSectionMax((r) => diskTemperature(r, rIn), rIn, 5 * rIn);
    expect(relErr(peak, (49 / 36) * rIn)).toBeLessThan(1e-6);
    expect(diskTemperature(peak, rIn)).toBeCloseTo(1, 12);
  });

  it('falls off as r^(-3/4) far from the inner edge', () => {
    const ratio = diskTemperature(1e8, 6) / diskTemperature(1e7, 6);
    expect(relErr(ratio, 10 ** -0.75)).toBeLessThan(1e-3);
  });

  it('is zero inside the inner edge', () => {
    expect(diskTemperature(5, 6)).toBe(0);
  });

  it('has the closed form the shader evaluates', () => {
    const k = diskTemperatureScale(6500);
    for (const r of [6.001, 7, 8.1667, 12, 20, 400]) {
      const x = r / 6;
      const shaderForm = k * x ** -0.75 * (1 - 1 / Math.sqrt(x)) ** 0.25;
      // 1 - x^(-1/2) cancels near r_in (8e-5 at r = 6.001), which amplifies rounding.
      expect(relErr(shaderForm, 6500 * diskTemperature(r, 6))).toBeLessThan(1e-11);
    }
  });
});

describe('disk compositing along a path', () => {
  const disk = { rIn: 6, rOut: 20, opacity: 1, peakTemperature: 6500 };
  const emitted = (r: number, lz: number, gObs: number) =>
    blackbodyColour(
      redshiftFactor(circularOrbitEmitter(r, 1), lz) * gObs * 6500 * diskTemperature(r, 6),
    ).map((c) => Math.max(0, c));

  it('an opaque disk shows only the first crossing inside [rIn, rOut]', () => {
    const out = compositeDisk(disk, [30, 4, 10, 12], 2, 1, 1.1);
    expect(out.transmittance).toBe(0);
    expect(out.emission).toEqual(emitted(10, 2, 1.1));
  });

  it('a translucent disk adds each crossing dimmed by the ones in front', () => {
    const half = { ...disk, opacity: 0.5 };
    const out = compositeDisk(half, [10, 25, 12], -1, 1, 1);
    const a = emitted(10, -1, 1);
    const b = emitted(12, -1, 1);
    expect(out.transmittance).toBe(0.25);
    out.emission.forEach((c, i) => {
      expect(c).toBeCloseTo(0.5 * a[i]! + 0.25 * b[i]!, 14);
    });
  });

  it('misses leave the light behind untouched', () => {
    expect(compositeDisk(disk, [], 0, 1, 1)).toEqual({ emission: [0, 0, 0], transmittance: 1 });
    expect(compositeDisk(disk, [5.9, 20.1], 0, 1, 1).transmittance).toBe(1);
  });
});
