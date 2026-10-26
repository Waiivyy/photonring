// Blackbody colour, sRGB conversion and tone mapping.
import { describe, expect, it } from 'vitest';
import {
  blackbodyColour,
  blackbodyXYZ,
  cieColourMatching,
  luminance,
  srgbEncode,
  toneMap,
  xyzToLinearSrgb,
} from '../../src/physics/index.ts';

const chromaticity = (xyz: readonly [number, number, number]) => {
  const s = xyz[0] + xyz[1] + xyz[2];
  return [xyz[0] / s, xyz[1] / s] as const;
};

describe('CIE 1931 colour-matching functions (Wyman, Sloan and Shirley 2013 multi-lobe fit)', () => {
  // Sample values of the CIE 1931 2-degree colour-matching functions, from the CIE dataset
  // doi:10.25039/CIE.DS.xvudnb9b (CC BY-SA 4.0).
  it.each([
    [450, 0.3362, 0.038, 1.77211],
    [500, 0.0049, 0.323, 0.272],
    [555, 0.5120501, 1.0, 0.005749999],
    [600, 1.0622, 0.631, 0.0008],
  ])('%d nm matches the CIE table within the fit accuracy', (nm, x, y, z) => {
    const [fx, fy, fz] = cieColourMatching(nm);
    expect(Math.abs(fx - x)).toBeLessThan(0.025);
    expect(Math.abs(fy - y)).toBeLessThan(0.025);
    expect(Math.abs(fz - z)).toBeLessThan(0.025);
  });
});

describe('blackbody chromaticity', () => {
  // Reference: Planck's law integrated against the CIE 1931 dataset above at 1 nm steps,
  // 360 to 830 nm, with c2 = 1.438776877e-2 m K (computed once, outside the repository).
  it.each([
    [1500, 0.58572, 0.39312],
    [3000, 0.43693, 0.40408],
    [6500, 0.31353, 0.32363],
    [10000, 0.28063, 0.28829],
    [20000, 0.25646, 0.25763],
  ])('%d K lies on the Planckian locus within 0.002', (T, x, y) => {
    const [cx, cy] = chromaticity(blackbodyXYZ(T));
    expect(Math.abs(cx - x)).toBeLessThan(0.002);
    expect(Math.abs(cy - y)).toBeLessThan(0.002);
  });

  it('CIE illuminant A (a 2856 K Planckian radiator) is at (0.44757, 0.40745)', () => {
    const [cx, cy] = chromaticity(blackbodyXYZ(2856));
    expect(Math.abs(cx - 0.44757)).toBeLessThan(0.002);
    expect(Math.abs(cy - 0.40745)).toBeLessThan(0.002);
  });

  it('hotter is bluer', () => {
    let last = 0;
    for (const T of [1000, 2000, 4000, 8000, 16000, 32000]) {
      const [r, , b] = blackbodyColour(T);
      expect(b / r).toBeGreaterThan(last);
      last = b / r;
    }
  });
});

describe('blackbody brightness', () => {
  it('is normalised to luminance 1 at 6500 K', () => {
    expect(luminance(blackbodyColour(6500))).toBeCloseTo(1, 3);
  });

  it('grows linearly with T deep in the Rayleigh-Jeans regime', () => {
    // At 5e5 K, x = c2 / (lambda T) is about 0.05 in the visible band, so 1/(e^x - 1) ~ 1/x - 1/2.
    const ratio = luminance(blackbodyColour(1e6)) / luminance(blackbodyColour(5e5));
    expect(ratio).toBeGreaterThan(1.98);
    expect(ratio).toBeLessThan(2.05);
  });

  it('falls steeply in the Wien regime', () => {
    expect(luminance(blackbodyColour(1000)) / luminance(blackbodyColour(500))).toBeGreaterThan(1e5);
  });

  it('is zero, not NaN, at and below absolute zero', () => {
    expect(blackbodyColour(0)).toEqual([0, 0, 0]);
    expect(blackbodyColour(-5)).toEqual([0, 0, 0]);
  });
});

describe('sRGB', () => {
  it('maps the D65 white point (x, y) = (0.3127, 0.3290), Y = 1, to (1, 1, 1)', () => {
    const x = 0.3127;
    const y = 0.329;
    const rgb = xyzToLinearSrgb([x / y, 1, (1 - x - y) / y]);
    for (const c of rgb) expect(c).toBeCloseTo(1, 4);
  });

  it('luminance of linear sRGB equals Y', () => {
    const xyz: [number, number, number] = [0.3, 0.42, 0.25];
    expect(luminance(xyzToLinearSrgb(xyz))).toBeCloseTo(0.42, 4);
  });

  it('encodes with the piecewise sRGB transfer function', () => {
    expect(srgbEncode(0)).toBe(0);
    expect(srgbEncode(1)).toBeCloseTo(1, 12);
    expect(srgbEncode(0.5)).toBeCloseTo(0.735357, 6);
    expect(Math.abs(srgbEncode(0.0031308) - srgbEncode(0.0031308 + 1e-12))).toBeLessThan(1e-9);
  });
});

describe('tone mapping', () => {
  it('is 0 at 0, linear for small values, monotonic and below 1', () => {
    expect(toneMap(0, 1.5)).toBe(0);
    expect(toneMap(1e-6, 1.5) / 1e-6).toBeCloseTo(1.5, 5);
    let last = 0;
    for (const x of [0.01, 0.1, 1, 10, 100]) {
      const y = toneMap(x, 1.5);
      expect(y).toBeGreaterThan(last);
      expect(y).toBeLessThan(1);
      last = y;
    }
  });
});
