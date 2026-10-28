// Integrator candidates (spec section 10, items 1, 2, 3, 4 and part of 10), in f64 and in an
// f32 emulation that rounds every operation with Math.fround.
import { describe, expect, it } from 'vitest';
import {
  criticalImpactParameter,
  deflectionAngleElliptic,
  f32,
  f64,
  impactParameterFromLocalAngle,
  traceBinetRK4,
  traceCartesianLeapfrog,
  traceCartesianRK4,
  type PlanarRayResult,
  type Round,
} from '../../src/physics/index.ts';
import { exactSweptAngle, inwardPsiForImpactParameter } from '../helpers/reference.ts';
import { measured } from '../helpers/measured.ts';

const M = 1;
const BC = criticalImpactParameter(M);

type Tracer = (r0: number, psi: number, round: Round, fine: boolean) => PlanarRayResult;

// "fine" settings are for f64 accuracy checks; the others are candidate renderer settings.
const METHODS: Record<string, Tracer> = {
  'Binet RK4': (r0, psi, round, fine) =>
    traceBinetRK4(M, r0, psi, { round, dphi: fine ? 0.005 : 0.05, maxSteps: 5000 }),
  'Cartesian RK4': (r0, psi, round, fine) =>
    traceCartesianRK4(M, r0, psi, {
      round,
      eta: fine ? 0.005 : 0.05,
      rEscape: Math.max(1000, 10 * r0),
      maxSteps: 50000,
    }),
  'Cartesian leapfrog': (r0, psi, round, fine) =>
    traceCartesianLeapfrog(M, r0, psi, {
      round,
      eta: fine ? 0.0005 : 0.005,
      rEscape: Math.max(1000, 10 * r0),
      maxSteps: 200000,
    }),
};

/** Error of the integrated path: final position angle against the exact swept angle to that radius. */
function pathError(ray: PlanarRayResult, r0: number, psi: number): number {
  return Math.abs(ray.positionAngle - exactSweptAngle(r0, psi, M, ray.finalRadius));
}

describe.each(Object.entries(METHODS))('%s', (name, trace) => {
  describe('1. critical impact parameter by bisection on capture versus escape', () => {
    it.each([
      ['f64', f64, 1e-6],
      ['f32', f32, 1e-4],
    ] as const)('%s: matches 3 sqrt(3) M', (p, round, tol) => {
      const r0 = 30;
      // chi is the angle from the inward radial: chi = 0 is captured, chi = pi/2 escapes.
      let lo = 0;
      let hi = Math.PI / 2;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const ray = trace(r0, Math.PI - mid, round, round === f64);
        if (ray.termination === 'captured') lo = mid;
        else hi = mid;
      }
      const bNum = impactParameterFromLocalAngle(r0, (lo + hi) / 2, M);
      const err = Math.abs(bNum / BC - 1);
      expect(measured(`item 1: b_c by bisection, ${name}, ${p}, relative`, err)).toBeLessThan(tol);
    });
  });

  describe('2. deflection versus the reference integrals (observer at 10^4 M)', () => {
    const r0 = 1e4;
    it.each([1.01, 1.02, 1.1, 2, 10, 100, 1000])('b = %s b_c', (ratio) => {
      const b = ratio * BC;
      const psi = inwardPsiForImpactParameter(r0, b, M);
      const alpha = deflectionAngleElliptic(b, M);
      const ray64 = trace(r0, psi, f64, true);
      expect(ray64.termination).toBe('escaped');
      const err64 = pathError(ray64, r0, psi) / alpha;
      expect(measured(`item 2: integrated deflection, ${name}, f64, relative`, err64)).toBeLessThan(
        1e-6,
      );
      const ray32 = trace(r0, psi, f32, false);
      expect(ray32.termination).toBe('escaped');
      const err32 = pathError(ray32, r0, psi) / alpha;
      expect(measured(`item 2: integrated deflection, ${name}, f32, relative`, err32)).toBeLessThan(
        1e-3,
      );
    });
  });

  describe('3. convergence', () => {
    it('error falls when the step parameter shrinks (f64)', () => {
      const r0 = 30;
      const psi = inwardPsiForImpactParameter(r0, 2 * BC, M);
      const coarse = pathError(trace(r0, psi, f64, false), r0, psi);
      const fine = pathError(trace(r0, psi, f64, true), r0, psi);
      const key = `item 3: renderer step error over fine step error, ${name}`;
      expect(measured(key, coarse / fine, 'min')).toBeGreaterThan(50);
    });
  });

  describe('4. termination', () => {
    it.each([
      ['f64', f64, 1e-6],
      ['f32', f32, 1e-3],
    ] as const)(
      '%s: inward rays are captured below b_c and escape above it, never hit the step limit',
      (_p, round, band) => {
        for (const r0 of [5, 30, 200]) {
          for (let i = 0; i <= 400; i++) {
            const psi = Math.PI / 2 + (i / 400) * (Math.PI / 2);
            const b = impactParameterFromLocalAngle(r0, psi, M);
            const ray = trace(r0, psi, round, false);
            expect(ray.termination).not.toBe('stepLimit');
            if (Math.abs(b / BC - 1) < band) continue;
            expect(ray.termination).toBe(b < BC ? 'captured' : 'escaped');
          }
        }
      },
    );

    it.each([
      ['f64', f64],
      ['f32', f32],
    ] as const)('%s: outward rays escape and edge directions stay finite', (_p, round) => {
      for (const r0 of [5, 30, 200]) {
        for (const psi of [0, 1e-9, 0.3, Math.PI / 2, 2.5, Math.PI - 1e-9, Math.PI]) {
          const ray = trace(r0, psi, round, false);
          expect(ray.termination).not.toBe('stepLimit');
          if (psi <= Math.PI / 2) expect(ray.termination).toBe('escaped');
          if (ray.termination === 'escaped') expect(Number.isFinite(ray.escapeAngle)).toBe(true);
        }
      }
    });
  });
});

describe('3. conserved quantities along a ray (f64)', () => {
  const r0 = 30;
  const psi = inwardPsiForImpactParameter(r0, 1.05 * BC, M);
  const b = 1.05 * BC;

  it('Binet: the first integral w^2 + u^2 (1 - 2Mu) = 1/b^2 holds at every step', () => {
    let worst = 0;
    traceBinetRK4(M, r0, psi, {
      round: f64,
      dphi: 0.005,
      maxSteps: 5000,
      onStep: ([u, w]) => {
        const invariant = (w as number) ** 2 + (u as number) ** 2 * (1 - 2 * M * (u as number));
        worst = Math.max(worst, Math.abs(invariant * b * b - 1));
      },
    });
    expect(measured('item 3: Binet first integral, relative', worst)).toBeLessThan(1e-9);
  });

  it.each([
    ['RK4', traceCartesianRK4, 0.005, 1e-9],
    ['leapfrog', traceCartesianLeapfrog, 0.0005, 1e-12],
  ] as const)(
    'Cartesian %s: h = |x cross v| and the energy integral 1/b^2 stay constant',
    (n, tracer, eta, hTol) => {
      let h0 = NaN;
      let worstH = 0;
      let worstB = 0;
      tracer(M, r0, psi, {
        round: f64,
        eta,
        rEscape: 1000,
        maxSteps: 200000,
        onStep: ([x, y, vx, vy]) => {
          const [px, py, qx, qy] = [x, y, vx, vy] as [number, number, number, number];
          const h = px * qy - py * qx;
          if (Number.isNaN(h0)) h0 = h;
          const r = Math.hypot(px, py);
          const invB2 = (qx * qx + qy * qy) / (h * h) - (2 * M) / r ** 3;
          worstH = Math.max(worstH, Math.abs(h / h0 - 1));
          worstB = Math.max(worstB, Math.abs(invB2 * b * b - 1));
        },
      });
      expect(measured(`item 3: Cartesian ${n}, h, relative`, worstH)).toBeLessThan(hTol);
      expect(measured(`item 3: Cartesian ${n}, energy integral, relative`, worstB)).toBeLessThan(
        1e-6,
      );
    },
  );

  it('halving the step cuts the Binet RK4 error by about 2^4', () => {
    const r0b = 30;
    const psib = inwardPsiForImpactParameter(r0b, 2 * BC, M);
    const err = (dphi: number) => {
      const ray = traceBinetRK4(M, r0b, psib, { round: f64, dphi, maxSteps: 10000 });
      return Math.abs(ray.escapeAngle - exactSweptAngle(r0b, psib, M));
    };
    const ratio = measured(
      'item 3: Binet RK4 error ratio when the step halves',
      err(0.08) / err(0.04),
    );
    expect(ratio).toBeGreaterThan(12);
    expect(ratio).toBeLessThan(20);
  });
});
