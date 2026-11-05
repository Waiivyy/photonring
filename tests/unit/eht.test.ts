// The physics under the EHT-style view (docs/PHYSICS.md, section 10d): the toy disk's brightness
// at all frequencies, the 2019 EHT resolution in units of M, the pixel scale at the shadow edge,
// the framing rule, and the camera roll that turns the image so north is up as for M87*.
import { describe, expect, it } from 'vitest';
import {
  cameraFrame,
  circularOrbitEmitter,
  compositeDiskBolometric,
  criticalImpactParameter,
  DEFAULT_DISK,
  diskTemperature,
  edgePixelScale,
  EHT_BEAM_UAS,
  EHT_THETA_G_UAS,
  ehtBeamFwhmM,
  ehtBeamSigmaM,
  ehtFieldOfView,
  imageRadiusFromConeAngle,
  M87_JET_PA_DEG,
  MAX_AUTO_FOV_DEG,
  M87_SKY_ROLL_DEG,
  pixelDirection,
  projectDirection,
  redshiftFactor,
  shadowAngularRadius,
  staticObserverFactor,
  type CameraParams,
  type Vec3,
} from '../../src/physics/index.ts';
import { measured } from '../helpers/measured.ts';

const M = 1;
const BC = criticalImpactParameter(M);
const DEG = Math.PI / 180;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rel = (a: number, b: number) => Math.abs(a / b - 1);

describe('bolometric disk brightness', () => {
  const g = (r: number, lz: number, gObs: number) =>
    redshiftFactor(circularOrbitEmitter(r, M), lz) * gObs;

  it('one crossing gives (g T-hat)^4 with the library redshift', () => {
    for (const [r, lz] of [
      [8, 0],
      [8, 4.5],
      [12, -4.5],
      [19.5, 2],
    ] as const) {
      const gObs = staticObserverFactor(30, M);
      const { intensity, transmittance } = compositeDiskBolometric(DEFAULT_DISK, [r], lz, M, gObs);
      const expected = (g(r, lz, gObs) * diskTemperature(r, DEFAULT_DISK.rIn)) ** 4;
      expect(rel(intensity, expected)).toBeLessThan(1e-12);
      expect(transmittance).toBe(0);
    }
  });

  it('face-on, g = sqrt(1 - 3M/r) times the observer factor', () => {
    const gObs = staticObserverFactor(200, M);
    const r = 9;
    const { intensity } = compositeDiskBolometric(DEFAULT_DISK, [r], 0, M, gObs);
    const expected = (Math.sqrt(1 - 3 / r) * gObs * diskTemperature(r, DEFAULT_DISK.rIn)) ** 4;
    expect(rel(intensity, expected)).toBeLessThan(1e-12);
  });

  it('does not depend on the peak temperature', () => {
    const a = compositeDiskBolometric(DEFAULT_DISK, [10], 3, M, 1).intensity;
    const b = compositeDiskBolometric({ ...DEFAULT_DISK, peakTemperature: 2e4 }, [10], 3, M, 1);
    expect(b.intensity).toBe(a);
  });

  it('ignores crossings outside the disk, and an escaped path adds nothing', () => {
    expect(compositeDiskBolometric(DEFAULT_DISK, [], 0, M, 1)).toEqual({
      intensity: 0,
      transmittance: 1,
    });
    expect(compositeDiskBolometric(DEFAULT_DISK, [4, 25, 300], 0, M, 1)).toEqual({
      intensity: 0,
      transmittance: 1,
    });
  });

  it('composites front to back with the disk opacity', () => {
    const disk = { ...DEFAULT_DISK, opacity: 0.6 };
    const radii = [9, 15, 7];
    const lz = 2;
    const j = radii.map((r) => (g(r, lz, 1) * diskTemperature(r, disk.rIn)) ** 4);
    const expected = 0.6 * j[0]! + 0.4 * 0.6 * j[1]! + 0.4 * 0.4 * 0.6 * j[2]!;
    const out = compositeDiskBolometric(disk, radii, lz, M, 1);
    expect(rel(out.intensity, expected)).toBeLessThan(1e-12);
    expect(out.transmittance).toBeCloseTo(0.4 ** 3, 15);
  });
});

describe('EHT resolution in units of M', () => {
  it('is the 20 uas resolution over theta_g = 3.8 uas, and its Gaussian sigma', () => {
    expect(EHT_BEAM_UAS).toBe(20);
    expect(EHT_THETA_G_UAS).toBe(3.8);
    expect(ehtBeamFwhmM()).toBe(20 / 3.8);
    expect(ehtBeamSigmaM()).toBeCloseTo(2.2351, 4);
    expect(ehtBeamSigmaM() * 2 * Math.sqrt(2 * Math.log(2))).toBeCloseTo(ehtBeamFwhmM(), 14);
  });
});

describe('pixel scale at the shadow edge', () => {
  it('equals the derivative of the image radius with respect to the impact parameter at b_c', () => {
    for (const rObs of [5, 17, 30, 100, 200]) {
      const k = Math.sqrt(1 - (2 * M) / rObs) / rObs;
      const height = 1080;
      const t = Math.tan(30 * DEG);
      const rho = (b: number) => imageRadiusFromConeAngle(Math.asin(k * b), height, t);
      const h = 1e-5 * BC;
      const numeric = (rho(BC + h) - rho(BC - h)) / (2 * h);
      expect(
        measured(
          'EHT pixel scale against a central difference, relative',
          rel(edgePixelScale(rObs, height, t, M), numeric),
        ),
      ).toBeLessThan(1e-9);
    }
  });

  it('differs from the secant scale (shadow radius over b_c) by exactly cos^2 of the edge angle', () => {
    for (const rObs of [30, 100, 200]) {
      const t = Math.tan(10 * DEG);
      const psi = shadowAngularRadius(rObs, M);
      const secant = imageRadiusFromConeAngle(psi, 900, t) / BC;
      expect(secant / edgePixelScale(rObs, 900, t, M)).toBeCloseTo(Math.cos(psi) ** 2, 12);
    }
  });
});

describe('framing of the EHT-style view', () => {
  it('fits a circle of 28 M at the edge scale into the shorter image side', () => {
    let checked = 0;
    for (const rObs of [17.5, 30, 60, 100, 200]) {
      for (const [w, h] of [
        [1920, 1080],
        [1080, 1920],
        [800, 800],
      ] as const) {
        const fov = ehtFieldOfView(rObs, w / h, 28, M);
        if (fov === MAX_AUTO_FOV_DEG) continue; // the cap: closer than about 17.2 M (portrait: 31 M)
        checked++;
        const s = edgePixelScale(rObs, h, Math.tan((fov * DEG) / 2), M);
        expect(rel(2 * 28 * s, Math.min(w, h))).toBeLessThan(1e-12);
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('gives the quoted fields of view and stops at the automatic cap', () => {
    expect(ehtFieldOfView(200, 16 / 9)).toBeCloseTo(15.876, 3);
    expect(ehtFieldOfView(100, 16 / 9)).toBeCloseTo(31.103, 3);
    expect(ehtFieldOfView(30, 16 / 9)).toBeCloseTo(86.513, 3);
    expect(ehtFieldOfView(17.2, 16 / 9)).toBe(MAX_AUTO_FOV_DEG);
    expect(ehtFieldOfView(17.3, 16 / 9)).toBeLessThan(MAX_AUTO_FOV_DEG);
  });
});

describe('camera roll', () => {
  const base: CameraParams = { distance: 200, azimuthDeg: 0, elevationDeg: -73, fovYDeg: 16 };

  it('a roll of 0 is the unrolled camera', () => {
    expect(cameraFrame({ ...base, rollDeg: 0 }, M)).toEqual(cameraFrame(base, M));
  });

  it('keeps an orthonormal basis with up x right = forward', () => {
    const f = cameraFrame({ ...base, rollDeg: 108 }, M);
    const cross = (a: Vec3, b: Vec3): Vec3 => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    expect(dot(f.right, f.up)).toBeCloseTo(0, 15);
    expect(dot(f.right, f.right)).toBeCloseTo(1, 15);
    expect(dot(f.up, f.up)).toBeCloseTo(1, 15);
    cross(f.up, f.right).forEach((v, i) => expect(v).toBeCloseTo(f.forward[i]!, 15));
  });

  it('turns the image anticlockwise about its centre by the roll angle', () => {
    const W = 1600;
    const H = 900;
    const flat = cameraFrame(base, M);
    const rolled = cameraFrame({ ...base, rollDeg: 30 }, M);
    for (const [x, y] of [
      [1000, 300],
      [200, 800],
      [800, 450],
    ] as const) {
      const d = pixelDirection(flat, W, H, x, y);
      const p = projectDirection(rolled, W, H, d)!;
      // Image coordinates with y up, relative to the centre, turned by +30 degrees.
      const u = x - W / 2;
      const v = H / 2 - y;
      const c = Math.cos(30 * DEG);
      const s = Math.sin(30 * DEG);
      expect(p[0] - W / 2).toBeCloseTo(u * c - v * s, 9);
      expect(H / 2 - p[1]).toBeCloseTo(u * s + v * c, 9);
    }
  });

  it('with the sky roll, the disk axis points to position angle 108 degrees, as M87*s spin axis', () => {
    expect(M87_JET_PA_DEG).toBe(288);
    expect(M87_SKY_ROLL_DEG).toBe(108);
    const f = cameraFrame({ ...base, rollDeg: M87_SKY_ROLL_DEG }, M);
    const z: Vec3 = [0, 0, 1];
    // Position angle: from image up (north) towards image left (east).
    const pa = Math.atan2(-dot(z, f.right), dot(z, f.up)) / DEG;
    expect(pa).toBeCloseTo(108, 10);
  });
});
