// Photon subrings: where the order-n image of a disk ring lies, for any n, and how successive
// images approach the shadow edge by a factor tending to e^pi per half-turn (Gralla, Holz and Wald
// 2019; Johnson et al. 2020). The solver is checked against an independent Gauss-Legendre
// quadrature of the same integral, against the Binet integrator (traceRay), against the published
// boundaries, and for consistency against ringImageAngle. Derivation: docs/PHYSICS.md, section 6b.
import { describe, expect, it } from 'vitest';
import {
  cameraFrame,
  criticalImpactParameter,
  criticalOrbitSweep,
  firstPlaneCrossingAngle,
  integrate,
  orbitPolynomial,
  orbitRoots,
  outboundImageOffset,
  outboundSweep,
  ringImageAngle,
  ringImageOffset,
  subringOffset,
  subringOffsetLeadingOrder,
  sweptAnglePlunging,
  sweptAngleQuadrature,
  traceRay,
  type Vec3,
} from '../../src/physics/index.ts';
import { measured } from '../helpers/measured.ts';

const M = 1;
const BC = criticalImpactParameter(M);
const R_OBS = 30;
const EDGES = [6, 20] as const; // the default disk's inner (ISCO) and outer radius
const E_PI = Math.exp(Math.PI);

/**
 * Five view directions at 30 M: camera elevation and image angle theta (from image right towards
 * image up). They give five different phases phi0 of the first disk-plane crossing.
 */
const VIEWS = [
  { name: 'face-on', el: 90, theta: 0 },
  { name: 'elevation 12, image top', el: 12, theta: 90 },
  { name: 'elevation 12, image bottom', el: 12, theta: 270 },
  { name: 'elevation 78, image top', el: 78, theta: 90 },
  { name: 'elevation 78, image bottom', el: 78, theta: 270 },
] as const;

interface Ray {
  readonly origin: Vec3;
  /** In-plane unit vector of the image direction theta, perpendicular to the line of sight. */
  readonly e2: Vec3;
  readonly forward: Vec3;
  readonly phi0: number;
}

function viewRay(el: number, theta: number): Ray {
  const f = cameraFrame({ distance: R_OBS, azimuthDeg: 0, elevationDeg: el, fovYDeg: 60 }, M);
  const t = (theta * Math.PI) / 180;
  const e2: Vec3 = [
    Math.cos(t) * f.right[0] + Math.sin(t) * f.up[0],
    Math.cos(t) * f.right[1] + Math.sin(t) * f.up[1],
    Math.cos(t) * f.right[2] + Math.sin(t) * f.up[2],
  ];
  const phi0 = firstPlaneCrossingAngle(f.position[2] / R_OBS, e2[2]);
  if (phi0 === undefined) throw new Error('ray plane is the disk plane');
  return { origin: f.position, e2, forward: f.forward, phi0 };
}

/** View direction with sin(alpha) = k b for a static observer at R_OBS (docs/PHYSICS.md, 6). */
function directionFor(ray: Ray, eps: number): Vec3 {
  const k = Math.sqrt(1 - (2 * M) / R_OBS) / R_OBS;
  const s = k * BC * (1 + eps);
  const c = Math.sqrt(1 - s * s);
  const d: Vec3 = [
    c * ray.forward[0] + s * ray.e2[0],
    c * ray.forward[1] + s * ray.e2[1],
    c * ray.forward[2] + s * ray.e2[2],
  ];
  const n = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / n, d[1] / n, d[2] / n];
}

/** The outbound sweep evaluated with the Gauss-Legendre quadrature instead of Carlson's R_F. */
function outboundSweepQuadrature(b: number, uo: number, uR: number): number {
  const { u2 } = orbitRoots(b, M);
  const leg = (u: number) => (u2 > u ? sweptAngleQuadrature(b, u, u2, M) : 0);
  return leg(uo) + leg(uR);
}

/** delta_n = (eps_n / eps_{n+1}) / e^pi - 1, and the bound docs/PHYSICS.md 6b derives for it. */
function ratioCheck(epsN: number, epsNext: number) {
  const delta = epsN / epsNext / E_PI - 1;
  const bound = (5 / 18) * epsN * Math.log(1 / epsN) + 1.5 * epsN;
  return { delta, bound };
}

describe('critical orbit sweep', () => {
  it('matches a quadrature of the critical orbit polynomial', () => {
    for (const u of [0, 1 / 200, 1 / 30, 1 / 20, 1 / 6, 1 / 3.5]) {
      const quad =
        u === 0 ? 0 : integrate((x) => 1 / Math.sqrt(orbitPolynomial(x, BC, M)), 0, u, 16);
      const err = Math.abs(criticalOrbitSweep(u, M) - quad);
      expect(measured('critical orbit sweep against quadrature, absolute', err)).toBeLessThan(
        1e-12,
      );
    }
  });

  it('has the values quoted in docs/PHYSICS.md 6b', () => {
    expect(criticalOrbitSweep(1 / 30, M)).toBeCloseTo(0.174038, 6);
    expect(criticalOrbitSweep(1 / 20, M)).toBeCloseTo(0.262589, 6);
    expect(criticalOrbitSweep(1 / 6, M)).toBeCloseTo(0.975474, 6);
  });

  it('rejects radii at or inside the photon sphere', () => {
    expect(() => criticalOrbitSweep(1 / 3, M)).toThrow(RangeError);
    expect(() => criticalOrbitSweep(-0.1, M)).toThrow(RangeError);
  });
});

describe.each(VIEWS)('subring offsets, $name', ({ el, theta }) => {
  const ray = viewRay(el, theta);

  it.each(EDGES)('R = %i M: the solved root satisfies the quadrature form of the sweep', (R) => {
    for (let n = 1; n <= 5; n++) {
      const sweep = ray.phi0 + n * Math.PI;
      const eps = subringOffset(R_OBS, R, n, ray.phi0, M);
      expect(eps).toBeGreaterThan(0);
      // d(sweep)/d(ln eps) is close to -1, so the residual is the relative error in eps. b =
      // b_c (1 + eps) moves in steps of one unit in the last place, about 1.7e-16 b_c, so eps is
      // resolved only to about 2e-16 / eps relative (4e-9 for order 5 at the top of the default
      // view); the tolerance adds that representation limit to 1e-12 for the integrals.
      const residual = outboundSweepQuadrature(BC * (1 + eps), 1 / R_OBS, 1 / R) - sweep;
      const tolerance = 1e-12 + Number.EPSILON / eps;
      expect(
        measured(
          'subring offset: quadrature residual of the sweep as a fraction of its tolerance',
          Math.abs(residual) / tolerance,
        ),
      ).toBeLessThan(1);
    }
  });

  it.each(EDGES)('R = %i M: agrees with ringImageAngle where both apply', (R) => {
    const k = Math.sqrt(1 - (2 * M) / R_OBS) / R_OBS;
    for (let n = 1; n <= 3; n++) {
      const sweep = ray.phi0 + n * Math.PI;
      const fromAngle = Math.sin(ringImageAngle(R_OBS, R, sweep, M)) / (k * BC) - 1;
      const eps = ringImageOffset(R_OBS, R, sweep, M);
      expect(
        measured('subring offset against ringImageAngle, relative', Math.abs(fromAngle / eps - 1)),
      ).toBeLessThan(1e-10);
    }
  });

  it.each(EDGES)('R = %i M: the traced ray crosses the disk plane at R on crossing n', (R) => {
    for (let n = 1; n <= 3; n++) {
      const eps = subringOffset(R_OBS, R, n, ray.phi0, M);
      const result = traceRay(M, ray.origin, directionFor(ray, eps), {
        dphi: 0.002,
        maxSteps: 40_000,
      });
      const crossing = result.crossings[n];
      expect(crossing).toBeDefined();
      expect(
        measured(
          'subring offset: traced crossing radius minus R, M',
          Math.abs(crossing!.radius - R),
        ),
      ).toBeLessThan(1e-7);
    }
  });

  it.each(EDGES)('R = %i M: the leading-order formula is within its derived bound', (R) => {
    for (let n = 1; n <= 5; n++) {
      const eps = subringOffset(R_OBS, R, n, ray.phi0, M);
      const lead = subringOffsetLeadingOrder(R_OBS, R, n, ray.phi0, M);
      const bound = eps * (Math.log(1 / eps) + 2);
      expect(
        measured(
          'subring leading order: error as a fraction of its bound',
          Math.abs(lead / eps - 1) / bound,
        ),
      ).toBeLessThan(1);
    }
  });

  it.each(EDGES)('R = %i M: successive offsets approach e^pi within the bound', (R) => {
    const eps = [1, 2, 3, 4, 5].map((n) => subringOffset(R_OBS, R, n, ray.phi0, M));
    for (let i = 0; i < 4; i++) {
      const { delta, bound } = ratioCheck(eps[i]!, eps[i + 1]!);
      expect(
        measured('subring ratio: |delta| as a fraction of its bound', Math.abs(delta) / bound),
      ).toBeLessThan(1);
    }
  });

  it.each(EDGES)('R = %i M: each further subring is at least 10 times closer to e^pi', (R) => {
    const eps = [2, 3, 4].map((n) => subringOffset(R_OBS, R, n, ray.phi0, M));
    const d2 = Math.abs(ratioCheck(eps[0]!, eps[1]!).delta);
    const d3 = Math.abs(ratioCheck(eps[1]!, eps[2]!).delta);
    expect(
      measured('subring ratio: convergence factor |delta_2| / |delta_3|', d2 / d3, 'min'),
    ).toBeGreaterThan(10);
  });
});

describe('subring offsets, published values', () => {
  it('face-on at 30 M: the ratios quoted in docs/PHYSICS.md 6b', () => {
    const phi0 = Math.PI / 2;
    const ratios = (R: number) =>
      [1, 2, 3, 4].map(
        (n) => subringOffset(R_OBS, R, n, phi0, M) / subringOffset(R_OBS, R, n + 1, phi0, M),
      );
    const inner = ratios(6);
    const outer = ratios(20);
    [23.6451, 23.2018, 23.1449, 23.1409].forEach((v, i) => expect(inner[i]).toBeCloseTo(v, 4));
    [26.2983, 23.3375, 23.1524, 23.1413].forEach((v, i) => expect(outer[i]).toBeCloseTo(v, 4));
  });

  it('Gralla, Holz and Wald (2019): the lensing and photon ring boundaries at infinity', () => {
    // Observer and source at infinity; GHW count orbits as n = (total sweep) / (2 pi). Above b_c
    // the ray comes back out: the outbound solver with both ends at u = 0.
    const above = (orbits: number) => BC * (1 + outboundImageOffset(0, 0, 2 * Math.PI * orbits, M));
    expect(above(3 / 4).toFixed(2)).toBe('6.17');
    expect(above(5 / 4).toFixed(2)).toBe('5.23');
    // Below b_c the ray falls in: total sweep from infinity to the horizon, solved by bisection.
    const below = (orbits: number) => {
      let lo = 1;
      let hi = BC * (1 - 1e-12);
      for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        if (sweptAnglePlunging(mid, 0, 1 / (2 * M), M) < 2 * Math.PI * orbits) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    expect(below(3 / 4).toFixed(2)).toBe('5.02');
    expect(below(5 / 4).toFixed(2)).toBe('5.19');
  });

  it('the escape sweep grows by one radian per factor e in 1/eps (instability rate pi per half-turn)', () => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= 30; i++) {
      const eps = 10 ** (-6 + (3 * i) / 30);
      xs.push(Math.log(eps));
      ys.push(outboundSweep(BC * (1 + eps), 1 / R_OBS, 0, M));
    }
    const mx = xs.reduce((a, b) => a + b) / xs.length;
    const my = ys.reduce((a, b) => a + b) / ys.length;
    let sxy = 0;
    let sxx = 0;
    xs.forEach((x, i) => {
      sxy += (x - mx) * (ys[i]! - my);
      sxx += (x - mx) ** 2;
    });
    const slope = sxy / sxx;
    expect(
      measured('escape sweep: least-squares slope against ln eps, minus -1', Math.abs(slope + 1)),
    ).toBeLessThan(1e-3);
  });
});

describe('ringImageOffset outside the outbound branch', () => {
  it('delegates direct images to ringImageAngle', () => {
    const k = Math.sqrt(1 - (2 * M) / R_OBS) / R_OBS;
    const sweep = 0.3; // a short sweep: the inbound image of the outer edge
    const eps = ringImageOffset(R_OBS, 20, sweep, M);
    const fromAngle = Math.sin(ringImageAngle(R_OBS, 20, sweep, M)) / (k * BC) - 1;
    expect(eps).toBeCloseTo(fromAngle, 14);
  });

  it('rejects bad inputs and sweeps it cannot represent', () => {
    expect(() => ringImageOffset(3, 6, 4, M)).toThrow(RangeError);
    expect(() => ringImageOffset(30, 6, -1, M)).toThrow(RangeError);
    expect(() => ringImageOffset(30, Number.NaN, 4, M)).toThrow(RangeError);
    // Order 12 lies about 1e-16 from the edge, below what b = b_c (1 + eps) can carry in f64.
    expect(() => subringOffset(30, 6, 12, Math.PI / 2, M)).toThrow(RangeError);
  });
});
