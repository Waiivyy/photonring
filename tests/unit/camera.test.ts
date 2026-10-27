// Camera model (spec section 10, item 9; part of item 10).
import { describe, expect, it } from 'vitest';
import {
  autoFieldOfView,
  cameraFrame,
  coneAngleFromImageRadius,
  imageRadiusFromConeAngle,
  pixelDirection,
  projectDirection,
  shadowAngularRadius,
  traceRay,
  type CameraParams,
  type Vec3,
} from '../../src/physics/index.ts';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const angle = (a: Vec3, b: Vec3) => Math.atan2(norm(cross(a, b)), dot(a, b));
const DEG = Math.PI / 180;

const base: CameraParams = { distance: 30, azimuthDeg: 0, elevationDeg: 0, fovYDeg: 60 };

describe('camera frame', () => {
  it.each([
    [30, 0, 0],
    [5, 45, 20],
    [200, -120, -60],
    [30, 10, 90],
    [30, 10, -90],
  ])('r = %d, az = %d, el = %d: orthonormal, right-handed, looking at the hole', (d, az, el) => {
    const f = cameraFrame({ ...base, distance: d, azimuthDeg: az, elevationDeg: el });
    for (const v of [f.forward, f.right, f.up]) expect(norm(v)).toBeCloseTo(1, 14);
    expect(dot(f.forward, f.right)).toBeCloseTo(0, 14);
    expect(dot(f.forward, f.up)).toBeCloseTo(0, 14);
    expect(dot(f.right, f.up)).toBeCloseTo(0, 14);
    // up x right = forward for a right-handed camera with right = forward x up.
    const c = cross(f.up, f.right);
    for (let i = 0; i < 3; i++) expect(c[i]).toBeCloseTo(f.forward[i] as number, 14);
    expect(norm(f.position)).toBeCloseTo(d, 12);
    const toHole: Vec3 = [-f.position[0] / d, -f.position[1] / d, -f.position[2] / d];
    expect(angle(f.forward, toHole)).toBeLessThan(1e-14);
  });

  it('places azimuth 0, elevation 0 on +x with +z up and +y to the right', () => {
    const f = cameraFrame(base);
    expect(f.position[0]).toBeCloseTo(30, 14);
    expect(f.up[2]).toBeCloseTo(1, 14);
    expect(f.right[1]).toBeCloseTo(1, 14);
  });

  it('positive elevation puts the camera above the disk plane', () => {
    expect(cameraFrame({ ...base, elevationDeg: 30 }).position[2]).toBeCloseTo(15, 12);
  });

  it.each([
    ['distance inside the horizon', { distance: 1.5 }],
    ['distance on the horizon', { distance: 2 }],
    ['NaN distance', { distance: NaN }],
    ['infinite azimuth', { azimuthDeg: Infinity }],
    ['elevation beyond the pole', { elevationDeg: 91 }],
    ['zero field of view', { fovYDeg: 0 }],
    ['field of view of 180 degrees', { fovYDeg: 180 }],
  ])('rejects %s', (_name, patch) => {
    expect(() => cameraFrame({ ...base, ...patch })).toThrow(RangeError);
  });
});

describe('pixel to ray direction', () => {
  it.each([
    [16, 9, 60],
    [1, 1, 30],
    [9, 16, 90],
    [21, 9, 120],
  ])('aspect %d:%d, fov %d: centre, edges and corners are at the right angles', (aw, ah, fov) => {
    const f = cameraFrame({ ...base, fovYDeg: fov });
    const w = aw * 40;
    const h = ah * 40;
    const centre = pixelDirection(f, w, h, w / 2, h / 2);
    expect(angle(centre, f.forward)).toBeLessThan(1e-14);
    const tanHalf = Math.tan((fov * DEG) / 2);
    // Top and bottom edge centres are half the vertical field of view away, above and below.
    const top = pixelDirection(f, w, h, w / 2, 0);
    expect(angle(top, f.forward)).toBeCloseTo((fov * DEG) / 2, 12);
    expect(dot(top, f.up)).toBeGreaterThan(0);
    expect(dot(pixelDirection(f, w, h, w / 2, h), f.up)).toBeLessThan(0);
    // Right edge: horizontal half-angle atan(aspect tan(fov/2)), on the right.
    const right = pixelDirection(f, w, h, w, h / 2);
    expect(angle(right, f.forward)).toBeCloseTo(Math.atan((w / h) * tanHalf), 12);
    expect(dot(right, f.right)).toBeGreaterThan(0);
    // Corner.
    const corner = pixelDirection(f, w, h, w, 0);
    expect(angle(corner, f.forward)).toBeCloseTo(Math.atan(tanHalf * Math.hypot(w / h, 1)), 12);
    expect(norm(corner)).toBeCloseTo(1, 14);
  });

  it.each([1, 1.5, 2, 3])(
    'device pixel ratio %d: the same CSS point gives the same direction',
    (dpr) => {
      const f = cameraFrame(base);
      const cssW = 640;
      const cssH = 360;
      for (const [x, y] of [
        [10.25, 20.5],
        [320, 180],
        [600.75, 1],
      ] as const) {
        const ref = pixelDirection(f, cssW, cssH, x, y);
        const scaled = pixelDirection(f, cssW * dpr, cssH * dpr, x * dpr, y * dpr);
        expect(angle(ref, scaled)).toBeLessThan(1e-15);
      }
    },
  );

  it('rejects empty images', () => {
    const f = cameraFrame(base);
    expect(() => pixelDirection(f, 0, 10, 0, 0)).toThrow(RangeError);
    expect(() => pixelDirection(f, 10, NaN, 0, 0)).toThrow(RangeError);
  });
});

describe('automatic field of view near the hole', () => {
  it('keeps the requested field of view far from the hole', () => {
    expect(autoFieldOfView(30, 1, 60)).toBe(60);
    expect(autoFieldOfView(200, 1, 40)).toBe(40);
  });

  it('widens so the shadow radius is at most 60 % of the image half-height', () => {
    for (const r of [6, 8, 10, 12]) {
      const fov = autoFieldOfView(r, 1, 60);
      expect(fov).toBeGreaterThan(60);
      const ratio = Math.tan(shadowAngularRadius(r, 1)) / Math.tan((fov * DEG) / 2);
      if (fov < 120) expect(ratio).toBeCloseTo(0.6, 12);
      else expect(ratio).toBeGreaterThan(0.6);
    }
  });

  it('caps at 120 degrees', () => {
    expect(autoFieldOfView(5, 1, 60)).toBe(120);
  });
});

describe('direction to image point (inverse of pixelDirection)', () => {
  it.each([
    [16, 9, 60],
    [9, 16, 30],
    [1, 1, 120],
    [21, 9, 90],
  ])('aspect %d:%d, fov %d: projecting a pixel direction gives the pixel back', (aw, ah, fov) => {
    const f = cameraFrame({ distance: 12, azimuthDeg: 37, elevationDeg: -23, fovYDeg: fov });
    const w = aw * 64;
    const h = ah * 64;
    for (const [x, y] of [
      [0, 0],
      [w / 2, h / 2],
      [w, h],
      [0.37 * w, 0.81 * h],
      [w + 50, -30],
    ] as const) {
      const p = projectDirection(f, w, h, pixelDirection(f, w, h, x, y));
      expect(p).not.toBeNull();
      expect(Math.abs((p as [number, number])[0] - x)).toBeLessThan(1e-9);
      expect(Math.abs((p as [number, number])[1] - y)).toBeLessThan(1e-9);
    }
  });

  it('returns null for directions at or behind the camera plane', () => {
    const f = cameraFrame(base);
    const back: Vec3 = [-f.forward[0], -f.forward[1], -f.forward[2]];
    expect(projectDirection(f, 160, 90, back)).toBeNull();
    expect(projectDirection(f, 160, 90, f.right)).toBeNull();
  });
});

describe('cone half-angle and image radius', () => {
  it('a cone around the optical axis images to tan(angle) / tan(fov/2) half-heights', () => {
    const t = Math.tan(30 * DEG);
    expect(imageRadiusFromConeAngle(30 * DEG, 1080, t)).toBeCloseTo(540, 9);
    expect(imageRadiusFromConeAngle(0, 1080, t)).toBe(0);
    const f = cameraFrame(base);
    const psi = 0.2;
    const r = imageRadiusFromConeAngle(psi, 1080, f.tanHalfFovY);
    const d = pixelDirection(f, 1920, 1080, 960 + r, 540);
    expect(angle(d, f.forward)).toBeCloseTo(psi, 12);
  });

  it('the two conversions are exact inverses', () => {
    for (const t of [Math.tan(15 * DEG), 1, Math.tan(60 * DEG)]) {
      for (const psi of [1e-6, 0.01, 0.3, 1.2]) {
        const px = imageRadiusFromConeAngle(psi, 1024, t);
        expect(coneAngleFromImageRadius(px, 1024, t)).toBeCloseTo(psi, 14);
      }
    }
  });
});

describe('shadow edge is the outline of the horizon and of the photon sphere', () => {
  // Every ray inside the analytic edge reaches r = 3M and then r = 2M; every ray outside escapes.
  // Checked half a pixel either side of the edge at 1080 rows, in 16 image directions.
  it.each([5, 10, 30, 100, 200])('r_o = %d M, capture radii 3M and 2.001M', (rObs) => {
    const f = cameraFrame({
      distance: rObs,
      azimuthDeg: 20,
      elevationDeg: 15,
      fovYDeg: autoFieldOfView(rObs, 1, 60),
    });
    const W = 1920;
    const H = 1080;
    const edge = imageRadiusFromConeAngle(shadowAngularRadius(rObs, 1), H, f.tanHalfFovY);
    for (let k = 0; k < 16; k++) {
      const theta = (2 * Math.PI * k) / 16;
      for (const [offset, expected] of [
        [-0.5, 'captured'],
        [0.5, 'escaped'],
      ] as const) {
        const rpx = edge + offset;
        const d = pixelDirection(
          f,
          W,
          H,
          W / 2 + rpx * Math.cos(theta),
          H / 2 - rpx * Math.sin(theta),
        );
        for (const captureRadius of [3, 2.001]) {
          const ray = traceRay(1, f.position, d, { dphi: 0.0125, maxSteps: 20000, captureRadius });
          expect(ray.termination).toBe(expected);
        }
      }
    }
  });
});
