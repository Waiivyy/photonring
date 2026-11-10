// Cross-check against an outside code: kgeo (Chael; GPL-3.0), at spin 0 (Stage 8 item 5, part B).
// kgeo was called from a separate Python driver run outside photonring's build and tests; no kgeo
// code is in the repository. Its output numbers are in tests/data/kgeo-bc5affe.json, with how they
// were produced, and this file re-checks photonring against them: the emission radius of every
// equatorial crossing (K1), the crossing count (K4), ring images (K2), the Keplerian redshift (K3),
// the critical curve (K5), and the conventions that map one code onto the other (P1 to P4).
// Tolerances and their derivations: tests/helpers/kgeo-compare.ts.
import { describe, expect, it } from 'vitest';
import {
  circularOrbitEmitter,
  criticalImpactParameter,
  redshiftFactor,
} from '../../src/physics/index.ts';
import {
  countComparison,
  driftBound,
  KGEO_FIXTURE_PATH,
  loadKgeoFixture,
  photonringRay,
  radiusComparisons,
  redshiftComparisons,
  ringComparison,
  sweepResidual,
  type KgeoRay,
  type PhotonringRay,
} from '../helpers/kgeo-compare.ts';
import { measured } from '../helpers/measured.ts';

const BC = criticalImpactParameter(1);
const fx = loadKgeoFixture();
const R_OBS = [100, 1000] as const;

/** photonring's rays for the fixture rays, traced once (two step sizes and two neighbours each). */
const traced = new Map<KgeoRay, PhotonringRay>();
function rayFor(ray: KgeoRay): PhotonringRay {
  let p = traced.get(ray);
  if (!p) {
    p = photonringRay(ray);
    traced.set(ray, p);
  }
  return p;
}

const fmt = (x: number) => x.toPrecision(3);

describe('kgeo fixture', () => {
  it('records how it was produced and holds output numbers only', () => {
    expect(fx.source.code).toBe('kgeo');
    expect(fx.source.commit).toBe('bc5affe810650fdb2396a1defc645c089db9f9e4');
    expect(fx.source.licence).toBe('GPL-3.0');
    expect(fx.source.note).toContain('no kgeo code is in the repository');
    expect(fx.produced.machine).toContain('Apple M5');
    expect(fx.produced.commands.length).toBeGreaterThanOrEqual(4);
    expect(fx.produced.packages.scipy).toBe('1.18.1');
    expect(fx.oracle.sha256).toMatch(/^[0-9a-f]{64}$/);
    // A few hundred samples covering K1 to K5 and P1 to P4, small enough to commit.
    expect(fx.sizeBytes).toBeLessThan(200_000);
    expect(fx.rays.length).toBeGreaterThan(300);
    expect(fx.rings.length).toBeGreaterThan(200);
    for (const rObs of R_OBS) {
      for (const th of [0, 17, 78]) {
        expect(fx.rays.some((r) => r.ro === rObs && r.thetaDeg === th)).toBe(true);
      }
    }
    // No code, only numbers and text: nothing that reads like Python source.
    expect(fx.text).not.toMatch(/\bdef \w+\(|\bimport (numpy|scipy|kgeo)\b|\bnp\.\w+\(|\bself\./);
  });
});

describe.each(R_OBS)('K1, emission radius per screen point and order, r_o = %i M', (rObs) => {
  it('every crossing matches kgeo (mbar = n) within its derived tolerance', () => {
    let worstRel = 0;
    let worstRatio = 0;
    let count = 0;
    const byOrder = [0, 0, 0, 0];
    for (const ray of fx.rays) {
      if (ray.ro !== rObs || ray.oracle) continue;
      for (const c of radiusComparisons(ray, rayFor(ray))) {
        count++;
        byOrder[Math.min(c.n, 3)] = Math.max(byOrder[Math.min(c.n, 3)]!, c.rel);
        worstRel = Math.max(worstRel, c.rel);
        worstRatio = Math.max(worstRatio, c.rel / c.tol);
        if (!(c.rel <= c.tol)) {
          throw new Error(
            `theta ${ray.thetaDeg} angle ${ray.angleDeg} b ${ray.alpha},${ray.beta} n ${c.n}: ` +
              `${fmt(c.rel)} > ${fmt(c.tol)}`,
          );
        }
      }
    }
    expect(count).toBeGreaterThan(400);
    byOrder.forEach((v, n) =>
      measured(
        `kgeo K1, r_o = ${rObs} M: worst relative radius difference, order ${n}${n === 3 ? '+' : ''}`,
        v,
      ),
    );
    measured(`kgeo K1, r_o = ${rObs} M: worst relative radius difference`, worstRel);
    expect(
      measured(
        `kgeo K1, r_o = ${rObs} M: worst difference as a fraction of its tolerance`,
        worstRatio,
      ),
    ).toBeLessThan(1);
  });

  it("photonring's drift of b, behind K1's rounding term, is rounding-sized at every crossing", () => {
    // K1 takes the drift capped at driftBound, and this asserts it stays under the cap, so a force
    // law that breaks the conservation fails here instead of widening K1's tolerance.
    let worst = 0;
    for (const ray of fx.rays) {
      if (ray.ro !== rObs) continue;
      const p = rayFor(ray);
      p.drift.forEach((d, j) => (worst = Math.max(worst, d / driftBound(p.steps[j]!))));
    }
    expect(
      measured(`kgeo K1, r_o = ${rObs} M: drift of b as a fraction of the rounding model`, worst),
    ).toBeLessThan(1);
  });

  it("just inside the critical curve, where kgeo leaves its accurate range, matches kgeo's ODE oracle", () => {
    // kgeo's region III formula needs scipy's ellipj at 1 - m < 1e-10 there, where that routine
    // loses accuracy past the quarter period; the fixture carries the oracle's radii instead.
    const inside = fx.rays.filter((r) => r.ro === rObs && r.oracle);
    expect(inside.length).toBeGreaterThan(0);
    let worstRatio = 0;
    for (const ray of inside) {
      expect(1 - Math.hypot(ray.alpha, ray.beta) / BC).toBeLessThan(fx.kgeoInsideUnreliable);
      for (const c of radiusComparisons(ray, rayFor(ray))) {
        worstRatio = Math.max(worstRatio, c.rel / c.tol);
      }
    }
    expect(
      measured(
        `kgeo K1 inside b_c, r_o = ${rObs} M: oracle difference as a fraction of its tolerance`,
        worstRatio,
      ),
    ).toBeLessThan(1);
  });
});

describe.each(R_OBS)('K4, number of crossings, r_o = %i M', (rObs) => {
  it("counts kgeo's Nmax + 1 crossings, inside r_o, with capture at 2.001 M", () => {
    let compared = 0;
    let smallestMargin = Infinity;
    for (const ray of fx.rays) {
      if (ray.ro !== rObs) continue;
      const c = countComparison(ray, rayFor(ray));
      smallestMargin = Math.min(smallestMargin, c.margin);
      if (!c.decidable) continue;
      compared++;
      expect(
        c.photonring,
        `theta ${ray.thetaDeg} angle ${ray.angleDeg} b ${Math.hypot(ray.alpha, ray.beta)}`,
      ).toBe(c.kgeo);
      // kgeo returns 0 for the order after its last crossing; photonring has no such crossing.
      expect(ray.rs[ray.nmax + 1]).toBe(0);
    }
    expect(compared).toBe(fx.rays.filter((r) => r.ro === rObs).length);
    measured(
      `kgeo K4, r_o = ${rObs} M: smallest sweep from a crossing to an end of the ray, rad`,
      smallestMargin,
      'min',
    );
  });
});

describe.each(R_OBS)('K2, ring images, r_o = %i M', (rObs) => {
  it('the order 0 to 2 images of R = 6 and 20 M match kgeo within their derived tolerance', () => {
    let worstRel = 0;
    let worstRatio = 0;
    let compared = 0;
    for (const ring of fx.rings) {
      if (ring.ro !== rObs) continue;
      const c = ringComparison(ring);
      if (c.nearFold) continue;
      compared++;
      worstRel = Math.max(worstRel, c.rel);
      worstRatio = Math.max(worstRatio, c.rel / c.tol);
      expect(
        c.rel,
        `theta ${ring.thetaDeg} angle ${ring.angleDeg} n ${ring.n} R ${ring.R}`,
      ).toBeLessThanOrEqual(c.tol);
    }
    expect(compared).toBeGreaterThan(100);
    measured(`kgeo K2, r_o = ${rObs} M: worst relative offset difference`, worstRel);
    expect(
      measured(
        `kgeo K2, r_o = ${rObs} M: worst difference as a fraction of its tolerance`,
        worstRatio,
      ),
    ).toBeLessThan(1);
  });

  it("photonring's roots for these images satisfy a quadrature of the sweep to 1e-12 rad (K2's solver term)", () => {
    const worst = { inbound: 0, outbound: 0 };
    const count = { inbound: 0, outbound: 0 };
    for (const ring of fx.rings) {
      if (ring.ro !== rObs) continue;
      const r = sweepResidual(ring);
      const side = r.inbound ? 'inbound' : 'outbound';
      count[side]++;
      worst[side] = Math.max(worst[side], Math.abs(r.residual) / r.tol);
    }
    expect(count.inbound).toBeGreaterThan(0);
    expect(count.outbound).toBeGreaterThan(0);
    for (const side of ['inbound', 'outbound'] as const) {
      expect(
        measured(
          `kgeo K2, r_o = ${rObs} M: ${side} sweep residual as a fraction of 1e-12 + 2^-52/eps`,
          worst[side],
        ),
      ).toBeLessThan(1);
      measured(`kgeo K2, r_o = ${rObs} M: ${side} images`, count[side], 'min');
    }
  });
});

describe.each(R_OBS)('K3, redshift of the Keplerian disk, r_o = %i M', (rObs) => {
  it("photonring's redshiftFactor matches kgeo's Iobs g where 6 <= r_s <= 20 M", () => {
    let worstRel = 0;
    let worstRatio = 0;
    let compared = 0;
    for (const ray of fx.rays) {
      if (ray.ro !== rObs || ray.oracle) continue;
      for (const c of redshiftComparisons(ray, rayFor(ray))) {
        compared++;
        worstRel = Math.max(worstRel, c.rel);
        worstRatio = Math.max(worstRatio, c.rel / c.tol);
        expect(c.rel, `theta ${ray.thetaDeg} angle ${ray.angleDeg} n ${c.n}`).toBeLessThanOrEqual(
          c.tol,
        );
      }
    }
    expect(compared).toBeGreaterThan(20);
    measured(`kgeo K3, r_o = ${rObs} M: worst relative g difference`, worstRel);
    expect(
      measured(
        `kgeo K3, r_o = ${rObs} M: worst difference as a fraction of its tolerance`,
        worstRatio,
      ),
    ).toBeLessThan(1);
  });
});

describe('K5, critical curve', () => {
  it("kgeo's classification and photonring's escape or capture agree at b = b_c (1 +- 1e-9)", () => {
    const edge = fx.rays.filter((r) => r.set === 'C');
    expect(edge.length).toBeGreaterThan(20);
    for (const ray of edge) {
      const outside = Math.hypot(ray.alpha, ray.beta) > BC;
      expect(ray.outside).toBe(outside);
      expect(rayFor(ray).termination).toBe(outside ? 'escaped' : 'captured');
    }
  });
});

describe('conventions that map kgeo onto photonring', () => {
  it('P1: the approaching side is on the image left in both codes, and a mirrored alpha fails K3', () => {
    let pairs = 0;
    let smallestMirrorRatio = Infinity;
    for (const right of fx.rays) {
      if (right.thetaDeg !== 78 || right.angleDeg !== 0 || right.oracle) continue;
      const left = fx.rays.find(
        (r) =>
          r.ro === right.ro && r.thetaDeg === 78 && r.angleDeg === 180 && r.alpha === -right.alpha,
      );
      if (!left || !(right.g[0] > 0 && left.g[0] > 0)) continue;
      pairs++;
      expect(left.g[0]).toBeGreaterThan(right.g[0]);
      const pl = rayFor(left);
      const pr = rayFor(right);
      expect(pl.lzOverE).toBeGreaterThan(0);
      expect(pr.lzOverE).toBeLessThan(0);
      for (const ray of [left, right]) {
        const mirrored = photonringRay(ray, { mapping: 'mirrorAlpha' });
        for (const c of redshiftComparisons(ray, mirrored)) {
          smallestMirrorRatio = Math.min(smallestMirrorRatio, c.rel / c.tol);
        }
      }
    }
    expect(pairs).toBeGreaterThan(3);
    expect(
      measured(
        'kgeo P1: smallest mirrored-alpha g difference as a multiple of its tolerance',
        smallestMirrorRatio,
        'min',
      ),
    ).toBeGreaterThan(1e3);
  });

  it('P2: the direct image of R = 6 M is larger at the top in both codes, and a mirrored beta fails K2', () => {
    let pairs = 0;
    let smallestMirrorRatio = Infinity;
    for (const top of fx.rings) {
      if (top.n !== 0 || top.R !== 6 || top.angleDeg !== 90 || top.thetaDeg === 0) continue;
      const bottom = fx.rings.find(
        (r) =>
          r.ro === top.ro &&
          r.thetaDeg === top.thetaDeg &&
          r.n === 0 &&
          r.R === 6 &&
          r.angleDeg === 270,
      );
      if (!bottom) continue;
      pairs++;
      expect(Math.hypot(top.alpha, top.beta)).toBeGreaterThan(
        Math.hypot(bottom.alpha, bottom.beta),
      );
      const ct = ringComparison(top);
      const cb = ringComparison(bottom);
      expect(ct.eps).toBeGreaterThan(cb.eps);
      for (const ring of [top, bottom]) {
        const c = ringComparison(ring, 'mirrorBeta');
        smallestMirrorRatio = Math.min(smallestMirrorRatio, c.rel / c.tol);
      }
    }
    expect(pairs).toBe(4);
    expect(
      measured(
        'kgeo P2: smallest mirrored-beta offset difference as a multiple of its tolerance',
        smallestMirrorRatio,
        'min',
      ),
    ).toBeGreaterThan(1e3);
  });

  it('P3: radii match only for mbar = n, not n +- 1', () => {
    for (const offset of [-1, 1]) {
      let comparable = 0;
      let failing = 0;
      for (const ray of fx.rays) {
        if (ray.oracle) continue;
        for (const c of radiusComparisons(ray, rayFor(ray), offset)) {
          comparable++;
          if (c.rel > c.tol) failing++;
        }
      }
      expect(comparable).toBeGreaterThan(200);
      expect(
        measured(
          `kgeo P3: fraction of crossings that fail with mbar = n ${offset > 0 ? '+' : '-'} 1`,
          failing / comparable,
          'min',
        ),
      ).toBeGreaterThan(0.95);
    }
  });

  it("P4: kgeo's prograde Keplerian disk turns in +phi with photonring's angular velocity", () => {
    expect(fx.velocity.length).toBeGreaterThanOrEqual(3);
    let worst = 0;
    for (const v of fx.velocity) {
      expect(v.uphi).toBeGreaterThan(0);
      const e = circularOrbitEmitter(v.r, 1);
      worst = Math.max(worst, Math.abs(v.uphi / v.ut / e.omega - 1), Math.abs(v.ut / e.ut - 1));
      // the same emitter seen along the approaching (+L_z) and receding (-L_z) direction
      expect(redshiftFactor(e, 5)).toBeGreaterThan(redshiftFactor(e, -5));
    }
    expect(
      measured('kgeo P4: Keplerian u^t and Omega against photonring, relative', worst),
    ).toBeLessThan(8 * Number.EPSILON);
  });
});

describe('fixture path', () => {
  it('is the committed file', () => {
    expect(KGEO_FIXTURE_PATH.endsWith('tests/data/kgeo-bc5affe.json')).toBe(true);
  });
});
