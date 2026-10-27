// Blackbody colour for the disk and the stars, in linear sRGB.
// - Planck's law with the second radiation constant c2 = 1.438776877e-2 m K (exact, CODATA).
// - CIE 1931 2-degree colour-matching functions: the multi-lobe piecewise Gaussian fit of Wyman,
//   Sloan and Shirley (2013), JCGT 2(2), eq. (4) and table 1.
// - XYZ to linear sRGB: the matrix of the W3C CSS Color Module Level 4 sample code (D65), which
//   follows IEC 61966-2-1.
import type { Vec3 } from './observer.ts';

type Lobe = readonly [alpha: number, beta: number, gamma: number, delta: number];

const X_LOBES: readonly Lobe[] = [
  [0.362, 442.0, 0.0624, 0.0374],
  [1.056, 599.8, 0.0264, 0.0323],
  [-0.065, 501.1, 0.049, 0.0382],
];
const Y_LOBES: readonly Lobe[] = [
  [0.821, 568.8, 0.0213, 0.0247],
  [0.286, 530.9, 0.0613, 0.0322],
];
const Z_LOBES: readonly Lobe[] = [
  [1.217, 437.0, 0.0845, 0.0278],
  [0.681, 459.0, 0.0385, 0.0725],
];

function lobes(nm: number, set: readonly Lobe[]): number {
  let sum = 0;
  for (const [alpha, beta, gamma, delta] of set) {
    const t = (nm - beta) * (nm < beta ? gamma : delta);
    sum += alpha * Math.exp(-0.5 * t * t);
  }
  return sum;
}

/** CIE 1931 colour-matching functions (x-bar, y-bar, z-bar) at a wavelength in nanometres. */
export function cieColourMatching(nm: number): Vec3 {
  return [lobes(nm, X_LOBES), lobes(nm, Y_LOBES), lobes(nm, Z_LOBES)];
}

const C2 = 1.438776877e-2;
const FIRST_NM = 360;
const LAST_NM = 830;
const CMF: readonly Vec3[] = Array.from({ length: LAST_NM - FIRST_NM + 1 }, (_, i) =>
  cieColourMatching(FIRST_NM + i),
);

/**
 * CIE XYZ of a blackbody at temperature T (kelvin), up to a constant factor: Planck's spectral
 * radiance lambda^-5 / (exp(c2 / (lambda T)) - 1) integrated against the colour-matching
 * functions at 1 nm steps from 360 to 830 nm.
 */
export function blackbodyXYZ(T: number): Vec3 {
  if (!(T > 0)) return [0, 0, 0];
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < CMF.length; i++) {
    const lambda = (FIRST_NM + i) * 1e-9;
    // Scaled by 1e-30 (nm^5 to m^5) so values stay in a comfortable range.
    const b = 1 / ((lambda * 1e9) ** 5 * Math.expm1(C2 / (lambda * T)));
    const [cx, cy, cz] = CMF[i] as Vec3;
    x += b * cx;
    y += b * cy;
    z += b * cz;
  }
  return [x, y, z];
}

const XYZ_TO_SRGB = [
  [12831 / 3959, -329 / 214, -1974 / 3959],
  [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
  [705 / 12673, -2585 / 12673, 705 / 667],
] as const;

export function xyzToLinearSrgb(xyz: Vec3): Vec3 {
  const [m0, m1, m2] = XYZ_TO_SRGB;
  return [
    m0[0] * xyz[0] + m0[1] * xyz[1] + m0[2] * xyz[2],
    m1[0] * xyz[0] + m1[1] * xyz[1] + m1[2] * xyz[2],
    m2[0] * xyz[0] + m2[1] * xyz[1] + m2[2] * xyz[2],
  ];
}

/** Luminance weights: the Y row of the inverse of XYZ_TO_SRGB. */
const LUMINANCE_WEIGHTS: Vec3 = (() => {
  const [[a, b, c], [d, e, f], [g, h, i]] = XYZ_TO_SRGB;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det];
})();

/** Luminance (CIE Y) of a linear sRGB colour. */
export function luminance(rgb: Vec3): number {
  return (
    LUMINANCE_WEIGHTS[0] * rgb[0] + LUMINANCE_WEIGHTS[1] * rgb[1] + LUMINANCE_WEIGHTS[2] * rgb[2]
  );
}

const NORMALISATION = 1 / blackbodyXYZ(6500)[1];

/**
 * Linear sRGB radiance of a blackbody at temperature T, scaled so that a 6500 K blackbody has
 * luminance 1. Brightness therefore grows with T as the physics dictates (steeply in the Wien
 * regime, linearly in the Rayleigh-Jeans regime). Values may be negative outside the sRGB gamut.
 */
export function blackbodyColour(T: number): Vec3 {
  const [x, y, z] = blackbodyXYZ(T);
  const rgb = xyzToLinearSrgb([x * NORMALISATION, y * NORMALISATION, z * NORMALISATION]);
  return [rgb[0], rgb[1], rgb[2]];
}

/** sRGB transfer function (IEC 61966-2-1), linear value in [0, 1] to encoded value. */
export function srgbEncode(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Exponential tone curve 1 - exp(-exposure x): linear near 0, saturating smoothly below 1. */
export function toneMap(x: number, exposure: number): number {
  return -Math.expm1(-exposure * x);
}

/**
 * Termination debug colours in linear sRGB, shared by both renderers, the legend swatches and the
 * validation classifier: escaped blue, captured black, step limit magenta.
 */
export const TERMINATION_COLOURS: Readonly<Record<'escaped' | 'captured' | 'stepLimit', Vec3>> = {
  escaped: [0.15, 0.3, 0.8],
  captured: [0, 0, 0],
  stepLimit: [1, 0, 1],
};
