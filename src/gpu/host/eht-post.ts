// The EHT-style view's post-process, as a plan shared by the GPU passes and a CPU reference
// (docs/PHYSICS.md, section 10d): blur the linear brightness to the 2019 EHT resolution scaled to
// the hole, normalise it to its brightest point and map it to false colour. The blur runs on a
// reduced grid: a separable tent reduce by f, a Gaussian there, and a bilinear upsample at pixel
// centres. Pure: imports only the physics library, so the CPU renderer, the tools and the tests
// can use it (docs/DESIGN.md, section 16).
import {
  ehtBeamFwhmM,
  ehtBeamSigmaM,
  edgePixelScale,
  type CameraParams,
} from '../../physics/index.ts';

/** Reduce factors, largest first. */
const FACTORS = [16, 8, 4, 2, 1] as const;
/**
 * Smallest blur the reduce may leave, in low-resolution pixels (sigma / f). The normalisation
 * reads the peak on the reduced grid, where a peak between texels comes out low; with 6 the
 * drop for a single point is at most 0.7 %, and every comparison with a direct full-resolution
 * Gaussian holds 1 level of 255 (with 4, a render at 30 M differed by 2 levels).
 */
export const MIN_SIGMA_LOW = 6;
/**
 * Normalisation floor: x = v / max(peak, NORMALISE_FLOOR). Continuous, so a nearly empty image
 * fades instead of flipping to full brightness (the disk's peak brightness is of order 0.1 to 1).
 */
export const NORMALISE_FLOOR = 1e-4;
/** Entries of the colour table: x = i / 1024, with the map's knots at table points. */
export const TABLE_SIZE = 1025;

export interface EhtPlan {
  /** Reduce factor per axis. */
  readonly f: number;
  readonly lowWidth: number;
  readonly lowHeight: number;
  /** The beam's standard deviation in full-resolution pixels, and its FWHM. */
  readonly sigmaPx: number;
  readonly beamFwhmPx: number;
  /** Standard deviation of the low-resolution kernel, in low-resolution pixels. */
  readonly sigmaLow: number;
  /** Normalised Gaussian weights for offsets -R..R, R = ceil(4 sigmaLow). */
  readonly weights: readonly number[];
}

/**
 * The plan for an image of the camera at width x height. The tent reduce and the bilinear upsample
 * each add (f^2 + 1/2) / 6 px^2 of variance, averaged over sub-pixel phase (docs/PHYSICS.md 10d),
 * so the low-resolution kernel supplies the rest of sigma^2.
 */
export function ehtPlan(camera: CameraParams, width: number, height: number, M = 1): EhtPlan {
  const tanHalf = Math.tan((camera.fovYDeg * Math.PI) / 360);
  const s = edgePixelScale(camera.distance, height, tanHalf, M);
  const sigmaPx = ehtBeamSigmaM() * s;
  const f = FACTORS.find((k) => sigmaPx / k >= MIN_SIGMA_LOW) ?? 1;
  const sigmaLow = f === 1 ? sigmaPx : Math.sqrt(sigmaPx ** 2 - (f * f + 0.5) / 3) / f;
  const R = Math.ceil(4 * sigmaLow);
  const raw = Array.from({ length: 2 * R + 1 }, (_, i) =>
    Math.exp(-((i - R) ** 2) / (2 * sigmaLow * sigmaLow)),
  );
  const sum = raw.reduce((a, b) => a + b, 0);
  return {
    f,
    lowWidth: Math.ceil(width / f),
    lowHeight: Math.ceil(height / f),
    sigmaPx,
    beamFwhmPx: ehtBeamFwhmM() * s,
    sigmaLow,
    weights: raw.map((v) => v / sum),
  };
}

// ---- Colour map --------------------------------------------------------------------------------

/** Where the afmhot formula changes slope. */
export const AFMHOT_KNOTS = [0, 0.25, 0.5, 0.75, 1] as const;

const clip = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The afmhot formula, in display (sRGB-encoded) values: red 2x, green 2x - 0.5, blue 2x - 1,
 * each clipped to [0, 1] (gnuplot rgbformulae 34, 35, 36; matplotlib's afmhot). Written from the
 * published formula; no code or table copied.
 */
export function afmhot(x: number): [number, number, number] {
  const t = clip(x);
  return [clip(2 * t), clip(2 * t - 0.5), clip(2 * t - 1)];
}

/** TABLE_SIZE display RGB triples at x = i / (TABLE_SIZE - 1). */
export function colourMapTable(): Float64Array {
  const table = new Float64Array(TABLE_SIZE * 3);
  for (let i = 0; i < TABLE_SIZE; i++) table.set(afmhot(i / (TABLE_SIZE - 1)), 3 * i);
  return table;
}

/** Display RGB at x by linear interpolation in the table, x clamped to [0, 1]. */
export function lookupColour(table: Float64Array, x: number): [number, number, number] {
  const u = clip(x) * (TABLE_SIZE - 1);
  const i = Math.min(Math.floor(u), TABLE_SIZE - 2);
  const t = u - i;
  const a = 3 * i;
  return [
    table[a]! + t * (table[a + 3]! - table[a]!),
    table[a + 1]! + t * (table[a + 4]! - table[a + 1]!),
    table[a + 2]! + t * (table[a + 5]! - table[a + 2]!),
  ];
}

// ---- CPU reference of the passes ---------------------------------------------------------------

/**
 * Tent reduce by f: low texel l (centre (l + 1/2) f in full-resolution pixels) takes
 * max(0, 1 - |x| / f) / f of each pixel at offset x; pixels beyond the line count as 0. f = 1 is
 * the identity.
 */
export function reduceTent1D(line: ArrayLike<number>, f: number): Float64Array {
  const n = line.length;
  const out = new Float64Array(Math.ceil(n / f));
  if (f === 1) {
    for (let i = 0; i < n; i++) out[i] = line[i]!;
    return out;
  }
  for (let l = 0; l < out.length; l++) {
    const c = (l + 0.5) * f;
    let acc = 0;
    for (let i = Math.max(0, l * f - f); i < Math.min(n, l * f + 2 * f); i++) {
      const w = 1 - Math.abs(i + 0.5 - c) / f;
      if (w > 0) acc += w * line[i]!;
    }
    out[l] = acc / f;
  }
  return out;
}

/** Convolution with symmetric weights for offsets -R..R, zero outside the line. */
export function blur1D(line: ArrayLike<number>, weights: readonly number[]): Float64Array {
  const n = line.length;
  const R = (weights.length - 1) / 2;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let q = Math.max(-R, -i); q <= Math.min(R, n - 1 - i); q++)
      acc += weights[q + R]! * line[i + q]!;
    out[i] = acc;
  }
  return out;
}

/** Linear interpolation of a reduced line at the centres of n full pixels, clamped to its ends. */
export function upsampleBilinear1D(low: ArrayLike<number>, f: number, n: number): Float64Array {
  const out = new Float64Array(n);
  const last = low.length - 1;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / f - 0.5;
    const l0 = Math.floor(u);
    const t = u - l0;
    const a = low[Math.min(last, Math.max(0, l0))]!;
    const b = low[Math.min(last, Math.max(0, l0 + 1))]!;
    out[i] = a + t * (b - a);
  }
  return out;
}

/**
 * Blurred and normalised linear brightness at full resolution (row-major, width x height), the
 * value the colour map receives. With normalise = false the blurred values are returned unscaled.
 */
export function ehtLinear(
  image: ArrayLike<number>,
  width: number,
  height: number,
  plan: EhtPlan,
  normalise = true,
): Float64Array {
  const { f, lowWidth: lw, lowHeight: lh, weights } = plan;
  // Reduce and blur along x for every row, then along y for every low column.
  const rows = new Float64Array(lw * height);
  for (let j = 0; j < height; j++) {
    const row = blur1D(
      reduceTent1D(
        image instanceof Float64Array
          ? image.subarray(j * width, (j + 1) * width)
          : Array.from({ length: width }, (_, i) => image[j * width + i]!),
        f,
      ),
      weights,
    );
    rows.set(row, j * lw);
  }
  const low = new Float64Array(lw * lh);
  const column = new Float64Array(height);
  for (let i = 0; i < lw; i++) {
    for (let j = 0; j < height; j++) column[j] = rows[j * lw + i]!;
    const c = blur1D(reduceTent1D(column, f), weights);
    for (let j = 0; j < lh; j++) low[j * lw + i] = c[j]!;
  }
  let peak = 0;
  for (const v of low) peak = Math.max(peak, v);
  const scale = normalise ? 1 / Math.max(peak, NORMALISE_FLOOR) : 1;
  // Upsample along y for every low column, then along x for every row.
  const tall = new Float64Array(lw * height);
  const lowColumn = new Float64Array(lh);
  for (let i = 0; i < lw; i++) {
    for (let j = 0; j < lh; j++) lowColumn[j] = low[j * lw + i]! * scale;
    const c = upsampleBilinear1D(lowColumn, f, height);
    for (let j = 0; j < height; j++) tall[j * lw + i] = c[j]!;
  }
  const out = new Float64Array(width * height);
  for (let j = 0; j < height; j++) {
    out.set(upsampleBilinear1D(tall.subarray(j * lw, (j + 1) * lw), f, width), j * width);
  }
  return out;
}

/** The view's final 8-bit display RGB (row-major, 3 bytes per pixel). */
export function postProcessEht(
  image: ArrayLike<number>,
  width: number,
  height: number,
  plan: EhtPlan,
  table: Float64Array,
): Uint8Array {
  const x = ehtLinear(image, width, height, plan);
  const rgb = new Uint8Array(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    const c = lookupColour(table, x[p]!);
    rgb[3 * p] = Math.round(255 * c[0]);
    rgb[3 * p + 1] = Math.round(255 * c[1]);
    rgb[3 * p + 2] = Math.round(255 * c[2]);
  }
  return rgb;
}
