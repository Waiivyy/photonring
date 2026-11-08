// Blackbody colour, sRGB conversion and tone mapping; and (Stage 8) the values the README, the
// About dialog and docs/PHYSICS.md section 10 quote to disclose the page's display choices.
import { describe, expect, it } from 'vitest';
import { encodeImage } from '../../src/cpu-renderer/render.ts';
import { GOLDEN_SCENES } from '../../src/cpu-renderer/scenes.ts';
import {
  blackbodyColour,
  blackbodyXYZ,
  cieColourMatching,
  DEFAULT_DISK,
  luminance,
  srgbEncode,
  toneMap,
  xyzToLinearSrgb,
} from '../../src/physics/index.ts';
import { PAGE_SCENE } from '../../src/ui/page-scene.ts';
import { measured } from '../helpers/measured.ts';

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
    measured(
      'colour: fit against the CIE samples, largest difference',
      Math.max(Math.abs(fx - x), Math.abs(fy - y), Math.abs(fz - z)),
    );
    expect(Math.abs(fx - x)).toBeLessThan(0.025);
    expect(Math.abs(fy - y)).toBeLessThan(0.025);
    expect(Math.abs(fz - z)).toBeLessThan(0.025);
  });
});

describe('blackbody chromaticity', () => {
  // Reference: Planck's law integrated against the CIE 1931 dataset above at 1 nm steps,
  // 360 to 830 nm, with c2 = 1.438776877e-2 m K (computed once, outside the repository).
  it.each([
    // At 1500 K most of the visible light is in the red tail, where the analytic fit deviates
    // most from the CIE table; the fit moves the chromaticity there by about 0.005.
    [1500, 0.58572, 0.39312, 0.005],
    [3000, 0.43693, 0.40408, 0.002],
    [6500, 0.31353, 0.32363, 0.002],
    [10000, 0.28063, 0.28829, 0.002],
    [20000, 0.25646, 0.25763, 0.002],
  ])('%d K lies on the Planckian locus (tolerance %d in x and y)', (T, x, y, tol) => {
    const [cx, cy] = chromaticity(blackbodyXYZ(T));
    measured(
      `colour: chromaticity offset from the Planckian locus at ${T} K`,
      Math.max(Math.abs(cx - x), Math.abs(cy - y)),
    );
    expect(Math.abs(cx - x)).toBeLessThan(tol);
    expect(Math.abs(cy - y)).toBeLessThan(tol);
  });

  it('CIE illuminant A (a 2856 K Planckian radiator) is at (0.44757, 0.40745)', () => {
    const [cx, cy] = chromaticity(blackbodyXYZ(2856));
    measured(
      'colour: chromaticity offset from CIE illuminant A (2856 K)',
      Math.max(Math.abs(cx - 0.44757), Math.abs(cy - 0.40745)),
    );
    expect(Math.abs(cx - 0.44757)).toBeLessThan(0.002);
    expect(Math.abs(cy - 0.40745)).toBeLessThan(0.002);
  });

  it('hotter is bluer: chromaticity x falls monotonically with temperature', () => {
    // Checked in XYZ: deep-red blackbodies lie outside the sRGB gamut (negative linear blue).
    let last = 1;
    for (const T of [1000, 2000, 4000, 8000, 16000, 32000]) {
      const [x] = chromaticity(blackbodyXYZ(T));
      expect(x).toBeLessThan(last);
      last = x;
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
    // The standard's two pieces meet only to about 3e-8 at the knee, far below 8-bit resolution.
    expect(Math.abs(srgbEncode(0.0031308) - srgbEncode(0.0031308 + 1e-12))).toBeLessThan(1e-7);
  });
});

describe('tone mapping', () => {
  it('is 0 at 0, linear for small values, monotonic and below 1', () => {
    expect(toneMap(0, 1.5)).toBe(0);
    expect(toneMap(1e-6, 1.5) / 1e-6).toBeCloseTo(1.5, 5);
    let last = 0;
    for (const x of [0.01, 0.1, 1, 10]) {
      const y = toneMap(x, 1.5);
      expect(y).toBeGreaterThan(last);
      expect(y).toBeLessThan(1);
      last = y;
    }
    expect(toneMap(100, 1.5)).toBeLessThanOrEqual(1);
  });
});

describe('display choices as the docs quote them (docs/PHYSICS.md, section 10)', () => {
  // The sRGB white point, D65, as in the CSS Color 4 sample code (conversions.js).
  const D65 = [0.3127, 0.329] as const;

  it("the disk's peak temperature as a blackbody lies close to the sRGB white point", () => {
    const T = DEFAULT_DISK.peakTemperature;
    const [x, y] = chromaticity(blackbodyXYZ(T));
    measured(`colour: chromaticity x of a ${T} K blackbody (fit)`, x);
    measured(`colour: chromaticity y of a ${T} K blackbody (fit)`, y);
    const d = measured(
      `colour: distance in (x, y) of a ${T} K blackbody from D65`,
      Math.hypot(x - D65[0], y - D65[1]),
    );
    // Quoted as (0.3134, 0.3239), 0.0052 from D65.
    expect(x.toFixed(4)).toBe('0.3134');
    expect(y.toFixed(4)).toBe('0.3239');
    expect(d.toFixed(4)).toBe('0.0052');
    expect(d).toBeLessThan(0.006);
  });

  // Drawn as the CPU reference renderer encodes a colour-view pixel: the page's exposure and tone
  // curve, the sRGB transfer function, 0 to 255. Computed by the library, not measured on a GPU.
  const drawn = (temperatures: readonly number[]): number[][] => {
    const linear = Float64Array.from(temperatures.flatMap((T) => blackbodyColour(T)));
    const settings = {
      ...GOLDEN_SCENES.diskInclined,
      width: temperatures.length,
      height: 1,
      exposure: PAGE_SCENE.exposure,
      toneMapping: PAGE_SCENE.toneMapping,
    };
    const stats = { escaped: 0, captured: 0, stepLimit: 0, nonFinite: 0 };
    const bytes = encodeImage({ width: temperatures.length, height: 1, linear, stats }, settings);
    return temperatures.map((_, i) => [...bytes.subarray(3 * i, 3 * i + 3)]);
  };

  it("the library encodes 6500, 3000 and 9000 K at the page's settings as these values of 255", () => {
    expect(PAGE_SCENE.exposure).toBe(1);
    expect(PAGE_SCENE.toneMapping).toBe(true);
    const temperatures = [6500, 3000, 9000];
    const rgb = drawn(temperatures);
    temperatures.forEach((T, i) =>
      rgb[i]!.forEach((v, c) => measured(`colour: ${T} K drawn, ${'RGB'[c]} of 255`, v)),
    );
    expect(rgb).toEqual([
      [210, 207, 210],
      [35, 23, 9],
      [248, 250, 253],
    ]);
  });

  it('luminance relative to a 6500 K blackbody: 0.010 at 3000 K, 3.16 at 9000 K', () => {
    const relative = (T: number) =>
      luminance(blackbodyColour(T)) / luminance(blackbodyColour(6500));
    const cool = measured('colour: luminance of 3000 K relative to 6500 K', relative(3000));
    const hot = measured('colour: luminance of 9000 K relative to 6500 K', relative(9000));
    expect(cool.toFixed(3)).toBe('0.010');
    expect(hot.toFixed(2)).toBe('3.16');
  });
});
