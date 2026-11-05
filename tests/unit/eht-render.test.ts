// The EHT-style view rendered by the CPU reference renderer (docs/PHYSICS.md, section 10d): the
// toy disk's brightness at all frequencies, blurred to the 2019 EHT resolution scaled to the hole,
// in false colour. Checks its symmetry, the size of its ring, where its bright side falls with the
// sky roll, and the downsampled blur against a direct Gaussian on this realistic content.
import { describe, expect, it } from 'vitest';
import {
  encodeImage,
  ehtIntensity,
  renderImage,
  type RenderSettings,
} from '../../src/cpu-renderer/render.ts';
import { DEFAULT_DISK } from '../../src/cpu-renderer/scenes.ts';
import {
  colourMapTable,
  ehtLinear,
  ehtPlan,
  lookupColour,
  postProcessEht,
} from '../../src/gpu/host/eht-post.ts';
import {
  coneAngleFromImageRadius,
  ehtFieldOfView,
  M87_SKY_ROLL_DEG,
  type CameraParams,
} from '../../src/physics/index.ts';
import { measured } from '../helpers/measured.ts';

const M = 1;

function settings(camera: CameraParams, size: number, samplesPerAxis = 1): RenderSettings {
  return {
    width: size,
    height: size,
    M,
    camera,
    disk: DEFAULT_DISK,
    sky: 'black',
    mode: 'eht',
    samplesPerAxis,
    dphi: 0.0125,
    maxSteps: 4000,
    exposure: 1,
    toneMapping: false,
  };
}

const preset = (rollDeg = M87_SKY_ROLL_DEG): CameraParams => ({
  distance: 200,
  azimuthDeg: 0,
  elevationDeg: -73,
  fovYDeg: ehtFieldOfView(200, 1),
  rollDeg,
});

/** Impact parameter of an image point at radius rho px from the centre (exact pinhole inverse). */
function impactAt(rho: number, s: RenderSettings): number {
  const t = Math.tan((s.camera.fovYDeg * Math.PI) / 360);
  const k = Math.sqrt(1 - (2 * M) / s.camera.distance) / s.camera.distance;
  return Math.sin(coneAngleFromImageRadius(rho, s.height, t)) / k;
}

describe('EHT-style view on the CPU', () => {
  it('adds nothing from the sky and keeps the disk light as a grey intensity', () => {
    // Asked for a starry sky, the view still shows the disk's brightness alone.
    const stars = renderImage({ ...settings(preset(), 64), sky: 'stars' });
    expect(stars.linear).toEqual(renderImage(settings(preset(), 64)).linear);
    const s = { ...settings(preset(), 64), sky: 'stars' as const, disk: null };
    const out = renderImage(s);
    expect(out.linear.every((v) => v === 0)).toBe(true);
    expect(encodeImage(out, s).every((v) => v === 0)).toBe(true);
    const lit = renderImage(settings(preset(), 64));
    for (let p = 0; p < 64 * 64; p++) {
      expect(lit.linear[3 * p + 1]).toBe(lit.linear[3 * p]);
      expect(lit.linear[3 * p + 2]).toBe(lit.linear[3 * p]);
    }
  });

  it('at 73 degrees above and below the disk the images are mirror images top to bottom', () => {
    const n = 192;
    const above = settings({ ...preset(0), elevationDeg: 73 }, n);
    const below = settings(preset(0), n);
    const a = encodeImage(renderImage(above), above);
    const b = encodeImage(renderImage(below), below);
    let worst = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n * 3; i++) {
        worst = Math.max(worst, Math.abs(a[j * n * 3 + i]! - b[(n - 1 - j) * n * 3 + i]!));
      }
    }
    expect(
      measured('EHT CPU: mirror images at +73 and -73 degrees, levels', worst),
    ).toBeLessThanOrEqual(1);
  }, 60_000);

  describe('at the preset (200 M, 73 degrees below the disk, turned north up)', () => {
    const s = settings(preset(), 432);
    const out = renderImage(s);
    const intensity = ehtIntensity(out);
    const plan = ehtPlan(s.camera, s.width, s.height, M);
    const blurred = ehtLinear(intensity, s.width, s.height, plan);

    it('reduces by 2 at this size, so the reduce is exercised', () => {
      expect(plan.f).toBe(2);
      expect(out.stats.nonFinite).toBe(0);
      expect(out.stats.stepLimit).toBe(0);
    });

    it('has its ring, the peak of the azimuthal mean, between 10.5 and 12 M', () => {
      const bin = 0.05;
      const sums = new Float64Array(600);
      const counts = new Float64Array(600);
      for (let j = 0; j < s.height; j++) {
        for (let i = 0; i < s.width; i++) {
          const rho = Math.hypot(i + 0.5 - s.width / 2, j + 0.5 - s.height / 2);
          const k = Math.floor(impactAt(rho, s) / bin);
          if (k < sums.length) {
            sums[k] = sums[k]! + blurred[j * s.width + i]!;
            counts[k] = counts[k]! + 1;
          }
        }
      }
      let best = 0;
      for (let k = 1; k < sums.length; k++) {
        if (counts[k]! > 0 && sums[k]! / counts[k]! > sums[best]! / Math.max(1, counts[best]!))
          best = k;
      }
      const mean = (k: number) => sums[k]! / counts[k]!;
      // Parabola through the three bins around the maximum.
      const [y0, y1, y2] = [mean(best - 1), mean(best), mean(best + 1)];
      const peak = (best + 0.5 + (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2)) * bin;
      expect(
        measured('EHT CPU: ring radius (peak of the azimuthal mean), M', peak),
      ).toBeGreaterThan(10.5);
      expect(peak).toBeLessThan(12);
    });

    it('turned north up, its bright side lies where M87*s does (position angle 150 to 200 degrees)', () => {
      // The published angle comes from fitted crescent models: the orientation of the brightness
      // asymmetry (EHT Paper I, Table 1). Its analogue here is the brightness-weighted direction
      // around the ring (6 to 18 M), which is 196.7 degrees at every size from 192 to 640 px; the
      // single brightest pixel of the broad crescent wanders from 199.5 to 201.0 degrees.
      let sx = 0;
      let sy = 0;
      for (let j = 0; j < s.height; j++) {
        for (let i = 0; i < s.width; i++) {
          const dx = i + 0.5 - s.width / 2;
          const dy = s.height / 2 - (j + 0.5);
          const rho = Math.hypot(dx, dy);
          const b = impactAt(rho, s);
          if (b < 6 || b > 18) continue;
          sx += (blurred[j * s.width + i]! * dx) / rho;
          sy += (blurred[j * s.width + i]! * dy) / rho;
        }
      }
      // Position angle: from image up (north) towards image left (east).
      const pa = ((Math.atan2(-sx, sy) * 180) / Math.PI + 360) % 360;
      expect(
        measured('EHT CPU: position angle of the bright side, degrees', pa),
      ).toBeGreaterThanOrEqual(150);
      expect(pa).toBeLessThanOrEqual(200);
    });

    it('the downsampled blur stays within 1 level of a direct full-resolution Gaussian', () => {
      const fast = postProcessEht(intensity, s.width, s.height, plan, colourMapTable());
      const direct = directGaussian(intensity, s.width, s.height, plan.sigmaPx);
      expect(
        measured(
          'EHT CPU: render blurred against a direct Gaussian, levels',
          maxDiff(fast, direct),
        ),
      ).toBeLessThanOrEqual(1);
    });
  });

  it('at 30 M the downsampled blur stays within 1 level of a direct full-resolution Gaussian', () => {
    const camera: CameraParams = {
      distance: 30,
      azimuthDeg: 0,
      elevationDeg: 12,
      fovYDeg: ehtFieldOfView(30, 1),
      rollDeg: M87_SKY_ROLL_DEG,
    };
    const s = settings(camera, 432);
    const intensity = ehtIntensity(renderImage(s));
    const plan = ehtPlan(camera, s.width, s.height, M);
    expect(plan.f).toBe(2);
    const fast = postProcessEht(intensity, s.width, s.height, plan, colourMapTable());
    const direct = directGaussian(intensity, s.width, s.height, plan.sigmaPx);
    expect(
      measured('EHT CPU: render blurred against a direct Gaussian, levels', maxDiff(fast, direct)),
    ).toBeLessThanOrEqual(1);
  }, 60_000);
});

/** Direct separable Gaussian at full resolution (zero border), normalised to its peak, mapped. */
function directGaussian(img: Float64Array, w: number, h: number, sigma: number): Uint8Array {
  const R = Math.ceil(4 * sigma);
  const raw = Array.from({ length: 2 * R + 1 }, (_, i) =>
    Math.exp(-((i - R) ** 2) / (2 * sigma * sigma)),
  );
  const sum = raw.reduce((a, b) => a + b);
  const k = raw.map((v) => v / sum);
  const tmp = new Float64Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let acc = 0;
      for (let q = Math.max(-R, -i); q <= Math.min(R, w - 1 - i); q++)
        acc += k[q + R]! * img[j * w + i + q]!;
      tmp[j * w + i] = acc;
    }
  }
  const out = new Float64Array(w * h);
  let peak = 0;
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      let acc = 0;
      for (let q = Math.max(-R, -j); q <= Math.min(R, h - 1 - j); q++)
        acc += k[q + R]! * tmp[(j + q) * w + i]!;
      out[j * w + i] = acc;
      peak = Math.max(peak, acc);
    }
  }
  const table = colourMapTable();
  const rgb = new Uint8Array(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const c = lookupColour(table, out[p]! / peak);
    for (let ch = 0; ch < 3; ch++) rgb[3 * p + ch] = Math.round(255 * c[ch]!);
  }
  return rgb;
}

function maxDiff(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i]! - b[i]!));
  return d;
}
