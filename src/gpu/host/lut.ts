// Blackbody colour lookup table for the shaders: the spectral integral is too costly per pixel,
// so the f64 physics library tabulates linear sRGB (and luminance) at log-spaced temperatures.
// lutColour is the CPU twin of the WGSL lookup and defines its behaviour outside the range.
import { blackbodyColour, luminance, type Vec3 } from '../../physics/index.ts';

export interface BlackbodyLut {
  readonly size: number;
  readonly tMin: number;
  readonly tMax: number;
  /** size x (r, g, b, luminance), f32 as uploaded to the GPU. */
  readonly data: Float32Array;
}

export function buildBlackbodyLut(size = 2048, tMin = 300, tMax = 1e5): BlackbodyLut {
  const data = new Float32Array(4 * size);
  for (let i = 0; i < size; i++) {
    const T = tMin * (tMax / tMin) ** (i / (size - 1));
    const rgb = blackbodyColour(T);
    data.set([rgb[0], rgb[1], rgb[2], luminance(rgb)], 4 * i);
  }
  return { size, tMin, tMax, data };
}

export const BLACKBODY_LUT = buildBlackbodyLut();

/**
 * Linear interpolation in log T. Below tMin the visible emission is negligible and the result is
 * zero; above tMax the visible band is in the Rayleigh-Jeans regime, so colour scales with T.
 */
export function lutColour(lut: BlackbodyLut, T: number): Vec3 {
  if (!(T >= lut.tMin)) return [0, 0, 0];
  const d = lut.data;
  if (T > lut.tMax) {
    const k = T / lut.tMax;
    const top = 4 * (lut.size - 1);
    return [(d[top] as number) * k, (d[top + 1] as number) * k, (d[top + 2] as number) * k];
  }
  const x = (Math.log(T / lut.tMin) / Math.log(lut.tMax / lut.tMin)) * (lut.size - 1);
  const i = Math.min(lut.size - 2, Math.floor(x));
  const f = x - i;
  const a = 4 * i;
  const b = a + 4;
  return [0, 1, 2].map(
    (c) => (d[a + c] as number) + f * ((d[b + c] as number) - (d[a + c] as number)),
  ) as unknown as Vec3;
}
