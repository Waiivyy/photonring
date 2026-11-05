// The EHT-style post-process (docs/PHYSICS.md, section 10d): the blur plan, the downsampled blur
// (tent reduce, Gaussian at low resolution, bilinear upsample), normalisation to the peak and the
// false-colour map. The CPU functions here are the reference the GPU passes are compared with.
import { describe, expect, it } from 'vitest';
import {
  AFMHOT_KNOTS,
  afmhot,
  blur1D,
  colourMapTable,
  ehtLinear,
  ehtPlan,
  lookupColour,
  MIN_SIGMA_LOW,
  postProcessEht,
  reduceTent1D,
  upsampleBilinear1D,
  type EhtPlan,
} from '../../src/gpu/host/eht-post.ts';
import {
  ehtBeamFwhmM,
  ehtFieldOfView,
  edgePixelScale,
  M87_SKY_ROLL_DEG,
  type CameraParams,
} from '../../src/physics/index.ts';
import { measured } from '../helpers/measured.ts';

const DEG = Math.PI / 180;
const PRESET = (aspect: number): CameraParams => ({
  distance: 200,
  azimuthDeg: 0,
  elevationDeg: -73,
  fovYDeg: ehtFieldOfView(200, aspect),
  rollDeg: M87_SKY_ROLL_DEG,
});

describe('false-colour map', () => {
  it('is the afmhot formula: black, red, orange, yellow, white at the quarter points', () => {
    expect(afmhot(0)).toEqual([0, 0, 0]);
    expect(afmhot(0.25)).toEqual([0.5, 0, 0]);
    expect(afmhot(0.5)).toEqual([1, 0.5, 0]);
    expect(afmhot(0.75)).toEqual([1, 1, 0.5]);
    expect(afmhot(1)).toEqual([1, 1, 1]);
    expect(AFMHOT_KNOTS).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('clamps outside 0 to 1', () => {
    expect(afmhot(-3)).toEqual([0, 0, 0]);
    expect(afmhot(7)).toEqual([1, 1, 1]);
  });

  it('the 1025-entry table reproduces the formula everywhere (its knots are table points)', () => {
    const table = colourMapTable();
    expect(table.length).toBe(1025 * 3);
    let worst = 0;
    for (let i = 0; i <= 10_000; i++) {
      const x = i / 10_000;
      const a = afmhot(x);
      const b = lookupColour(table, x);
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(a[c]! - b[c]!));
    }
    expect(worst).toBeLessThan(1e-12);
  });

  it('never gets darker as the value rises (luminance of the table)', () => {
    const table = colourMapTable();
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    let prev = -1;
    for (let i = 0; i < 1025; i++) {
      const y =
        0.2126 * lin(table[3 * i]!) +
        0.7152 * lin(table[3 * i + 1]!) +
        0.0722 * lin(table[3 * i + 2]!);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });
});

describe('blur plan', () => {
  it('blurs by the EHT resolution at the shadow edge scale of the image', () => {
    const camera = PRESET(16 / 9);
    const plan = ehtPlan(camera, 1920, 1080);
    const s = edgePixelScale(200, 1080, Math.tan((camera.fovYDeg * DEG) / 2));
    expect(plan.beamFwhmPx).toBeCloseTo(ehtBeamFwhmM() * s, 9);
    expect(plan.sigmaPx * 2 * Math.sqrt(2 * Math.LN2)).toBeCloseTo(plan.beamFwhmPx, 9);
    expect(plan.beamFwhmPx).toBeCloseTo(101.5, 1);
  });

  it('reduces by the largest of 1, 2, 4, 8, 16 that keeps 6 low-resolution pixels per sigma', () => {
    expect(MIN_SIGMA_LOW).toBe(6);
    for (const [w, h] of [
      [160, 90],
      [480, 270],
      [960, 540],
      [1920, 1080],
      [3840, 2160],
    ] as const) {
      const plan = ehtPlan(PRESET(w / h), w, h);
      const allowed = [1, 2, 4, 8, 16].filter((f) => plan.sigmaPx / f >= MIN_SIGMA_LOW);
      expect(plan.f).toBe(allowed.length > 0 ? Math.max(...allowed) : 1);
      expect(plan.lowWidth).toBe(Math.ceil(w / plan.f));
      expect(plan.lowHeight).toBe(Math.ceil(h / plan.f));
      expect(plan.weights.length).toBe(2 * Math.ceil(4 * plan.sigmaLow) + 1);
      expect(plan.weights.reduce((a, b) => a + b)).toBeCloseTo(1, 14);
    }
    expect(ehtPlan(PRESET(16 / 9), 160, 90).f).toBe(1);
    expect(ehtPlan(PRESET(16 / 9), 1920, 1080).f).toBe(4);
    expect(ehtPlan(PRESET(16 / 9), 3840, 2160).f).toBe(8);
  });

  it('the chain adds exactly (f^2 + 1/2) / 3 px^2 to the kernel, averaged over sub-texel phase', () => {
    for (const f of [2, 4, 8, 16]) {
      const n = 64 * f;
      const sigmaLow = 4.7;
      const weights = gaussianWeights(sigmaLow);
      let sum = 0;
      for (let phase = 0; phase < f; phase++) {
        const p = n / 2 + phase;
        const line = new Float64Array(n);
        line[p] = 1;
        const out = upsampleBilinear1D(blur1D(reduceTent1D(line, f), weights), f, n);
        sum += moment2(out, p + 0.5);
      }
      const kernelVar = discreteVariance(weights);
      const expected = f * f * kernelVar + (f * f + 0.5) / 3;
      expect(Math.abs(sum / f / expected - 1)).toBeLessThan(1e-9);
    }
  });

  it('matches the target sigma within 0.2 % (the kernel is cut at 4 sigma)', () => {
    for (const [w, h] of [
      [960, 540],
      [1920, 1080],
      [3840, 2160],
      [1080, 1920],
    ] as const) {
      const plan = ehtPlan(PRESET(w / h), w, h);
      const total = plan.f * plan.f * discreteVariance(plan.weights) + (plan.f * plan.f + 0.5) / 3;
      expect(
        measured(
          'EHT blur: chain variance against sigma^2, relative',
          Math.abs(total / plan.sigmaPx ** 2 - 1),
        ),
      ).toBeLessThan(2e-3);
    }
  });
});

describe('downsampled blur against a direct full-resolution Gaussian', () => {
  for (const [w, h] of [
    [960, 540],
    [1920, 1080],
  ] as const) {
    it(`${w} x ${h}: a point keeps its position and the beam width`, () => {
      const plan = ehtPlan(PRESET(w / h), w, h);
      let worstCentroid = 0;
      let worstWidth = 0;
      for (let phase = 0; phase < plan.f; phase++) {
        const img = new Float64Array(w * h);
        const px = Math.floor(w / 2) + phase;
        const py = Math.floor(h / 2) + ((phase * 3) % plan.f);
        img[py * w + px] = 1;
        const x = postProcessLinear(img, w, h, plan);
        const row = x.subarray(py * w, (py + 1) * w);
        worstCentroid = Math.max(worstCentroid, Math.abs(centroid(row) - (px + 0.5)));
        worstWidth = Math.max(worstWidth, Math.abs(fwhm(row) / plan.beamFwhmPx - 1));
      }
      expect(measured('EHT blur: point centroid shift, px', worstCentroid)).toBeLessThan(0.25);
      expect(measured('EHT blur: point FWHM against the beam, relative', worstWidth)).toBeLessThan(
        0.01,
      );
    }, 60_000);

    it(`${w} x ${h}: a toy-disk ring differs by at most 1 level of 255 after the colour map`, () => {
      const plan = ehtPlan(PRESET(w / h), w, h);
      const img = toyDisk(w, h, plan);
      const fast = postProcessEht(img, w, h, plan, colourMapTable());
      const direct = directGaussianColour(img, w, h, plan.sigmaPx);
      expect(
        measured('EHT blur: toy disk against a direct Gaussian, levels', maxDiff(fast, direct)),
      ).toBeLessThanOrEqual(1);
    }, 60_000);
  }

  it('thin features: a 1 px ring and a single bright pixel also stay within 1 level', () => {
    // The hardest inputs: the normalisation then follows one sharp feature, whose blurred peak on
    // the reduced grid depends on where it sits inside a texel (MIN_SIGMA_LOW keeps that small).
    const w = 960;
    const h = 540;
    const plan = ehtPlan(PRESET(w / h), w, h);
    const s = plan.beamFwhmPx / ehtBeamFwhmM();
    const ring = new Float64Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const b = Math.hypot(i + 0.5 - w / 2, j + 0.5 - h / 2) / s;
        if (Math.abs(b - 5.43) * s < 0.5) ring[j * w + i] = 1;
      }
    }
    const point = new Float64Array(w * h);
    point[(h / 2 + 3) * w + w / 2 + 5] = 1;
    const table = colourMapTable();
    for (const [name, img] of [
      ['1 px ring', ring],
      ['single pixel', point],
    ] as const) {
      const d = maxDiff(
        postProcessEht(img, w, h, plan, table),
        directGaussianColour(img, w, h, plan.sigmaPx),
      );
      expect(
        measured(`EHT blur: ${name} against a direct Gaussian, levels`, d),
      ).toBeLessThanOrEqual(1);
    }
  }, 60_000);
});

describe('normalisation', () => {
  it('maps the brightest blurred point to 1 and an empty image to black', () => {
    const w = 320;
    const h = 180;
    const plan = ehtPlan(PRESET(w / h), w, h);
    const img = toyDisk(w, h, plan);
    const x = postProcessLinear(img, w, h, plan);
    expect(Math.max(...x)).toBeCloseTo(1, 12);
    const black = postProcessEht(new Float64Array(w * h), w, h, plan, colourMapTable());
    expect(black.every((v) => v === 0)).toBe(true);
  });

  it('scales continuously below the floor instead of switching to full brightness', () => {
    const w = 320;
    const h = 180;
    const plan = ehtPlan(PRESET(w / h), w, h);
    const img = toyDisk(w, h, plan);
    const peak = Math.max(...postProcessLinear(img, w, h, plan, false));
    const tiny = img.map((v) => (v * 1e-6) / peak);
    expect(Math.max(...postProcessLinear(tiny, w, h, plan))).toBeLessThan(0.02);
  });
});

// ---- helpers --------------------------------------------------------------------------------

function gaussianWeights(sigma: number): number[] {
  const R = Math.ceil(4 * sigma);
  const w = Array.from({ length: 2 * R + 1 }, (_, i) =>
    Math.exp(-((i - R) ** 2) / (2 * sigma ** 2)),
  );
  const sum = w.reduce((a, b) => a + b);
  return w.map((v) => v / sum);
}

function discreteVariance(w: readonly number[]): number {
  const R = (w.length - 1) / 2;
  return w.reduce((acc, v, i) => acc + v * (i - R) ** 2, 0);
}

/** Second moment of a line about `c` (pixel i has its centre at i + 0.5), normalised by its sum. */
function moment2(line: ArrayLike<number>, c: number): number {
  let s = 0;
  let m = 0;
  for (let i = 0; i < line.length; i++) {
    s += line[i]!;
    m += line[i]! * (i + 0.5 - c) ** 2;
  }
  return m / s;
}

function centroid(line: ArrayLike<number>): number {
  let s = 0;
  let m = 0;
  for (let i = 0; i < line.length; i++) {
    s += line[i]!;
    m += line[i]! * (i + 0.5);
  }
  return m / s;
}

/** Full width at half maximum, crossings found by linear interpolation. */
function fwhm(line: ArrayLike<number>): number {
  let peak = 0;
  let at = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i]! > peak) {
      peak = line[i]!;
      at = i;
    }
  }
  const half = peak / 2;
  let l = at;
  while (l > 0 && line[l - 1]! > half) l--;
  let r = at;
  while (r < line.length - 1 && line[r + 1]! > half) r++;
  const left = l - 1 + (half - line[l - 1]!) / (line[l]! - line[l - 1]!);
  const right = r + (line[r]! - half) / (line[r]! - line[r + 1]!);
  return right - left;
}

/** The normalised linear values of postProcessEht, before the colour map. */
function postProcessLinear(
  img: Float64Array,
  w: number,
  h: number,
  plan: EhtPlan,
  normalise = true,
): Float64Array {
  return ehtLinear(img, w, h, plan, normalise);
}

/** Annulus from 6.7 to 20 M with a steep inner rise, a sharp outer edge and a 40 % asymmetry. */
function toyDisk(w: number, h: number, plan: EhtPlan): Float64Array {
  const s = plan.beamFwhmPx / ehtBeamFwhmM();
  const img = new Float64Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5 - w / 2) / s;
      const y = (h / 2 - j - 0.5) / s;
      const b = Math.hypot(x, y);
      if (b < 6.7 || b > 20) continue;
      const t = b ** -0.75 * (1 - Math.sqrt(6 / (b - 0.6))) ** 0.25;
      img[j * w + i] = t ** 4 * (1 + 0.4 * (x / b));
    }
  }
  return img;
}

/** Direct separable Gaussian at full resolution (zero border), normalised to its peak, mapped. */
function directGaussianColour(img: Float64Array, w: number, h: number, sigma: number): Uint8Array {
  const k = gaussianWeights(sigma);
  const R = (k.length - 1) / 2;
  const tmp = new Float64Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let acc = 0;
      for (let q = -R; q <= R; q++) {
        const ii = i + q;
        if (ii >= 0 && ii < w) acc += k[q + R]! * img[j * w + ii]!;
      }
      tmp[j * w + i] = acc;
    }
  }
  const out = new Float64Array(w * h);
  let peak = 0;
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      let acc = 0;
      for (let q = -R; q <= R; q++) {
        const jj = j + q;
        if (jj >= 0 && jj < h) acc += k[q + R]! * tmp[jj * w + i]!;
      }
      out[j * w + i] = acc;
      peak = Math.max(peak, acc);
    }
  }
  const table = colourMapTable();
  const rgb = new Uint8Array(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const c = lookupColour(table, peak > 0 ? out[p]! / peak : 0);
    for (let ch = 0; ch < 3; ch++) rgb[3 * p + ch] = Math.round(255 * c[ch]!);
  }
  return rgb;
}

function maxDiff(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i]! - b[i]!));
  return d;
}
