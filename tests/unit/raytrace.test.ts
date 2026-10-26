// 3D ray tracer built on the planar Binet integrator (spec section 10, items 3, 4, 5, 7, 8, 10).
import { describe, expect, it } from 'vitest';
import {
  cameraFrame,
  circularOrbitEmitter,
  criticalImpactParameter,
  impactParameterFromLocalAngle,
  pixelDirection,
  redshiftFactor,
  shadowAngularRadius,
  traceRay,
  type RayResult,
  type Vec3,
} from '../../src/physics/index.ts';
import { traceCartesian3D } from '../helpers/cartesian3d.ts';
import { randomUnitVector, seededRandom } from '../helpers/random.ts';
import { exactRadiusAtAngle, exactSweptAngle } from '../helpers/reference.ts';

const M = 1;
const BC = criticalImpactParameter(M);
const OPTS = { dphi: 0.0125, maxSteps: 4000 };

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const angle = (a: Vec3, b: Vec3) => Math.atan2(norm(cross(a, b)), dot(a, b));

/** Local angle psi from the outward radial, and whether b is inside the near-critical band. */
function geometry(origin: Vec3, d: Vec3) {
  const r0 = norm(origin);
  const psi = Math.acos(Math.max(-1, Math.min(1, dot(d, origin) / r0)));
  const b = impactParameterFromLocalAngle(r0, psi, M);
  return { r0, psi, b, nearCritical: Math.abs(b / BC - 1) < 1e-3 };
}

/** Random view directions through the image of a camera, the way a renderer samples them. */
function cameraRays(
  distance: number,
  elevationDeg: number,
  count: number,
  seed: number,
  fovYDeg = 60,
): { origin: Vec3; d: Vec3 }[] {
  const frame = cameraFrame({ distance, azimuthDeg: 20, elevationDeg, fovYDeg });
  const rand = seededRandom(seed);
  return Array.from({ length: count }, () => ({
    origin: frame.position,
    d: pixelDirection(frame, 16, 9, 16 * rand(), 9 * rand()),
  }));
}

describe('3. planar reduction against an independent 3D Cartesian integration', () => {
  it('random rays: same fate, escape directions within 1e-6 rad, Cartesian path stays in its plane', () => {
    const rand = seededRandom(7);
    const radii = [5, 12, 30, 80, 200];
    let compared = 0;
    for (let i = 0; i < 60; i++) {
      const r = radii[i % radii.length] as number;
      const u = randomUnitVector(rand);
      const origin: Vec3 = [r * u[0], r * u[1], r * u[2]];
      const d = randomUnitVector(rand);
      if (geometry(origin, d).nearCritical) continue;
      const ours = traceRay(M, origin, d, OPTS);
      const ref = traceCartesian3D(M, origin, d);
      expect(ours.termination).toBe(ref.termination);
      expect(ref.planeDeviation).toBeLessThan(1e-12);
      if (ours.termination === 'escaped') {
        expect(angle(ours.direction as Vec3, ref.direction)).toBeLessThan(1e-6);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(30);
  });
});

describe('4. capture and escape around the analytic shadow edge, any camera position', () => {
  it.each([
    [30, 0, 0],
    [30, 40, 35],
    [5, 200, -70],
    [200, 0, 90],
    [12, 0, -90],
  ])('r = %d, az = %d, el = %d', (distance, az, el) => {
    const f = cameraFrame({ distance, azimuthDeg: az, elevationDeg: el, fovYDeg: 60 });
    const psiSh = shadowAngularRadius(distance, M);
    const rand = seededRandom(distance + el);
    for (let i = 0; i < 40; i++) {
      // A direction at angle psiSh +- 0.01 rad from the hole direction, random roll.
      const roll = 2 * Math.PI * rand();
      for (const [delta, expected] of [
        [-0.01, 'captured'],
        [0.01, 'escaped'],
      ] as const) {
        const a = psiSh + delta;
        const side: Vec3 = [
          Math.cos(roll) * f.right[0] + Math.sin(roll) * f.up[0],
          Math.cos(roll) * f.right[1] + Math.sin(roll) * f.up[1],
          Math.cos(roll) * f.right[2] + Math.sin(roll) * f.up[2],
        ];
        const d: Vec3 = [
          Math.cos(a) * f.forward[0] + Math.sin(a) * side[0],
          Math.cos(a) * f.forward[1] + Math.sin(a) * side[1],
          Math.cos(a) * f.forward[2] + Math.sin(a) * side[2],
        ];
        expect(traceRay(M, f.position, d, OPTS).termination).toBe(expected);
      }
    }
  });
});

describe('7. disk plane crossings', () => {
  const configs = [
    ['above the disk, 30 M, 30 deg', 30, 30],
    ['near edge-on, 30 M, 1e-4 deg', 30, 1e-4],
    ['exactly in the plane, 30 M', 30, 0],
    ['close and steep, 6 M, 60 deg', 6, 60],
    ['far, 200 M, 10 deg', 200, 10],
  ] as const;

  it.each(configs)('%s: counts agree across step sizes 0.05, 0.0125, 0.003125', (_n, dist, el) => {
    for (const { origin, d } of cameraRays(dist, el, 300, 11)) {
      if (geometry(origin, d).nearCritical) continue;
      const counts = [0.05, 0.0125, 0.003125].map(
        (dphi) => traceRay(M, origin, d, { dphi, maxSteps: 20000 }).crossings.length,
      );
      expect(counts[0]).toBe(counts[2]);
      expect(counts[1]).toBe(counts[2]);
    }
  });

  it.each(configs)(
    '%s: escaped rays cross as often as the exact escape angle implies',
    (_n, dist, el) => {
      for (const { origin, d } of cameraRays(dist, el, 300, 12)) {
        const g = geometry(origin, d);
        if (g.nearCritical) continue;
        const ray = traceRay(M, origin, d, OPTS);
        if (ray.termination !== 'escaped' || ray.crossings.length === 0) continue;
        const phiInf = exactSweptAngle(g.r0, g.psi, M);
        const first = ray.crossings[0]?.phi as number;
        const expected = Math.max(0, Math.ceil((phiInf - first) / Math.PI));
        expect(ray.crossings.length).toBe(expected);
      }
    },
  );

  it.each(configs)(
    '%s: crossing radii match the exact radius at the same angle',
    (_n, dist, el) => {
      let checked = 0;
      for (const { origin, d } of cameraRays(dist, el, 200, 13)) {
        const g = geometry(origin, d);
        if (g.nearCritical) continue;
        for (const [dphi, tol] of [
          [0.0125, 1e-7],
          [0.05, 1e-4],
        ] as const) {
          const ray = traceRay(M, origin, d, { dphi, maxSteps: 20000 });
          for (const c of ray.crossings) {
            if (c.radius < 4 || c.radius > 1000) continue;
            const exact = exactRadiusAtAngle(g.r0, g.psi, c.phi, M);
            if (!Number.isFinite(exact)) continue;
            expect(Math.abs(c.radius / exact - 1)).toBeLessThan(tol);
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(20);
    },
  );

  it('crossing positions lie in the equatorial plane', () => {
    for (const { origin, d } of cameraRays(30, 30, 200, 14)) {
      for (const c of traceRay(M, origin, d, OPTS).crossings) {
        expect(Math.abs(c.position[2])).toBeLessThan(1e-12 * c.radius);
        expect(norm(c.position)).toBeCloseTo(c.radius, 9);
      }
    }
  });

  it('camera exactly in the plane: no crossing at the camera, the first one at phi = pi', () => {
    let seen = 0;
    for (const { origin, d } of cameraRays(30, 0, 200, 15)) {
      if (d[2] === 0) continue;
      const ray = traceRay(M, origin, d, OPTS);
      if (ray.crossings.length > 0) {
        expect(ray.crossings[0]?.phi).toBe(Math.PI);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  it('a ray lying in the disk plane has no crossings (edge-on, zero thickness)', () => {
    const origin: Vec3 = [30, 0, 0];
    for (const d of [
      [-1, 0.1, 0],
      [-0.6, -0.8, 0],
      [0.3, 0.9, 0],
    ] as const) {
      const n = Math.hypot(...d);
      const ray = traceRay(M, origin, [d[0] / n, d[1] / n, 0], OPTS);
      expect(ray.crossings).toEqual([]);
    }
  });

  it('near the horizon (capture radius 2.01 M): counts agree and no crossing lies inside', () => {
    for (const { origin, d } of cameraRays(10, 30, 300, 16, 90)) {
      if (geometry(origin, d).nearCritical) continue;
      const runs = [0.05, 0.0125, 0.003125].map((dphi) =>
        traceRay(M, origin, d, { dphi, maxSteps: 20000, captureRadius: 2.01 }),
      );
      for (const run of runs) {
        for (const c of run.crossings) expect(c.radius).toBeGreaterThanOrEqual(2.01 * (1 - 1e-9));
      }
      expect(runs[0]?.crossings.length).toBe(runs[2]?.crossings.length);
      expect(runs[1]?.crossings.length).toBe(runs[2]?.crossings.length);
    }
  });
});

describe('5. redshift sign along traced rays', () => {
  it('disk rotating counterclockwise seen from +z: the side moving toward the camera is blueshifted', () => {
    // Camera on the +x side; image right is +y. Material at -y moves toward +x, toward the camera.
    const frame = cameraFrame({ distance: 30, azimuthDeg: 0, elevationDeg: 10, fovYDeg: 40 });
    let pairs = 0;
    for (const x of [10, 30, 50, 70, 90]) {
      for (const y of [40, 50, 60, 70]) {
        const left = traceRay(M, frame.position, pixelDirection(frame, 200, 100, 100 - x, y), OPTS);
        const right = traceRay(
          M,
          frame.position,
          pixelDirection(frame, 200, 100, 100 + x, y),
          OPTS,
        );
        const cl = left.crossings[0];
        const cr = right.crossings[0];
        if (!cl || !cr || cl.radius < 6 || cl.radius > 20) continue;
        expect(Math.abs(cl.radius - cr.radius)).toBeLessThan(1e-9 * cl.radius);
        expect(left.lzOverE).toBeGreaterThan(0);
        expect(right.lzOverE).toBeCloseTo(-left.lzOverE, 9);
        const g = (ray: RayResult, r: number) =>
          redshiftFactor(circularOrbitEmitter(r, M), ray.lzOverE);
        expect(g(left, cl.radius)).toBeGreaterThan(g(right, cr.radius));
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThan(5);
  });

  it('|L_z / E| never exceeds the impact parameter', () => {
    for (const { origin, d } of cameraRays(30, 30, 200, 17)) {
      const ray = traceRay(M, origin, d, OPTS);
      expect(Math.abs(ray.lzOverE)).toBeLessThanOrEqual(ray.impactParameter * (1 + 1e-12));
    }
  });
});

describe('8. flat space (M = 0)', () => {
  it('the escape direction is the view direction, exactly', () => {
    for (const { origin, d } of cameraRays(30, 25, 100, 18)) {
      const ray = traceRay(0, origin, d, OPTS);
      expect(ray.termination).toBe('escaped');
      expect(ray.direction).toEqual(d);
    }
  });

  it('the only crossing is where the straight line meets z = 0', () => {
    for (const { origin, d } of cameraRays(30, 25, 100, 19)) {
      const ray = traceRay(0, origin, d, OPTS);
      const s = -origin[2] / d[2];
      if (!(s > 0)) {
        expect(ray.crossings).toEqual([]);
        continue;
      }
      expect(ray.crossings).toHaveLength(1);
      const p: Vec3 = [origin[0] + s * d[0], origin[1] + s * d[1], 0];
      expect(ray.crossings[0]?.radius).toBeCloseTo(norm(p), 10);
    }
  });

  it('a tiny mass bends rays continuously away from the flat result', () => {
    for (const { origin, d } of cameraRays(30, 25, 50, 20)) {
      const ray = traceRay(1e-9, origin, d, OPTS);
      expect(angle(ray.direction as Vec3, d)).toBeLessThan(1e-7);
    }
  });
});

describe('10. robustness', () => {
  it('a ray aimed exactly at the hole is captured, with no crossings', () => {
    const origin: Vec3 = [10, -20, 15];
    const r = norm(origin);
    const ray = traceRay(M, origin, [-origin[0] / r, -origin[1] / r, -origin[2] / r], OPTS);
    expect(ray.termination).toBe('captured');
    expect(ray.crossings).toEqual([]);
  });

  it('rays along the polar axis from a camera on the axis', () => {
    const origin: Vec3 = [0, 0, 30];
    const away = traceRay(M, origin, [0, 0, 1], OPTS);
    expect(away.termination).toBe('escaped');
    expect(away.direction).toEqual([0, 0, 1]);
    expect(traceRay(M, origin, [0, 0, -1], OPTS).termination).toBe('captured');
    const tilt = 1e-12;
    const nearly = traceRay(M, origin, [tilt, 0, -Math.sqrt(1 - tilt * tilt)], OPTS);
    expect(nearly.termination).toBe('captured');
    const nearlyAway = traceRay(M, origin, [tilt, 0, Math.sqrt(1 - tilt * tilt)], OPTS);
    expect(nearlyAway.direction?.every(Number.isFinite)).toBe(true);
  });

  it.each([5, 200])('camera at %d M: every result over an image grid is finite', (distance) => {
    const f = cameraFrame({ distance, azimuthDeg: 0, elevationDeg: 20, fovYDeg: 90 });
    for (let j = 0; j <= 12; j++) {
      for (let i = 0; i <= 20; i++) {
        const ray = traceRay(M, f.position, pixelDirection(f, 20, 12, i, j), OPTS);
        expect(ray.termination).not.toBe('stepLimit');
        if (ray.direction) expect(ray.direction.every(Number.isFinite)).toBe(true);
        for (const c of ray.crossings) expect(Number.isFinite(c.radius)).toBe(true);
        expect(Number.isFinite(ray.lzOverE)).toBe(true);
      }
    }
  });

  it.each([
    ['origin inside the horizon', [1, 0, 0], [0, 1, 0], {}],
    ['origin NaN', [NaN, 0, 30], [0, 1, 0], {}],
    ['direction not a unit vector', [30, 0, 0], [-1, 1, 0], {}],
    ['direction NaN', [30, 0, 0], [NaN, 0, 0], {}],
    ['zero step', [30, 0, 0], [-1, 0, 0], { dphi: 0 }],
    ['no steps allowed', [30, 0, 0], [-1, 0, 0], { maxSteps: 0 }],
    ['capture radius outside the photon sphere', [30, 0, 0], [-1, 0, 0], { captureRadius: 3.5 }],
    ['capture radius on the horizon', [30, 0, 0], [-1, 0, 0], { captureRadius: 2 }],
  ] as const)('rejects %s', (_n, origin, d, patch) => {
    expect(() => traceRay(M, origin as Vec3, d as Vec3, { ...OPTS, ...patch })).toThrow(RangeError);
  });
});
