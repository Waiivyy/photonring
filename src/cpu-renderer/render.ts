// CPU reference renderer: traces every sample with the f64 physics library. Pure computation;
// writing files is left to the callers (tools/ and tests/).
import {
  cameraFrame,
  compositeDisk,
  pixelDirection,
  skyRadiance,
  srgbEncode,
  staticObserverFactor,
  TERMINATION_COLOURS,
  toneMap,
  traceRay,
  type CameraParams,
  type DiskSettings,
  type Vec3,
} from '../physics/index.ts';

export type { DiskSettings };

export interface RenderSettings {
  readonly width: number;
  readonly height: number;
  readonly M: number;
  readonly camera: CameraParams;
  readonly disk: DiskSettings | null;
  /** 'uniform' is a sky of radiance 1 in every direction, for validation renders. */
  readonly sky: 'stars' | 'uniform';
  /** 'termination' colours each sample by why its ray ended. */
  readonly mode: 'colour' | 'termination';
  /** Supersampling: n x n samples per pixel on a regular grid; 1 samples the pixel centre. */
  readonly samplesPerAxis: number;
  readonly dphi: number;
  readonly maxSteps: number;
  readonly exposure: number;
  /** false: linear values are clamped to [0, 1] instead of tone mapped (validation renders). */
  readonly toneMapping: boolean;
}

export interface RenderStats {
  readonly escaped: number;
  readonly captured: number;
  readonly stepLimit: number;
  /** Samples whose colour was NaN or infinite (replaced by black). Must be 0. */
  readonly nonFinite: number;
}

export interface RenderOutput {
  readonly width: number;
  readonly height: number;
  /** Linear RGB, three values per pixel, row-major from the top-left corner. */
  readonly linear: Float64Array;
  /** Counts per sample, not per pixel. */
  readonly stats: RenderStats;
}

function validate(s: RenderSettings): void {
  const positiveInt = (v: number, max: number) => Number.isInteger(v) && v >= 1 && v <= max;
  if (!positiveInt(s.width, 4096) || !positiveInt(s.height, 4096)) {
    throw new RangeError('width and height must be integers from 1 to 4096');
  }
  if (!positiveInt(s.samplesPerAxis, 8)) throw new RangeError('samplesPerAxis must be 1 to 8');
  if (!(Number.isFinite(s.exposure) && s.exposure >= 0)) throw new RangeError('bad exposure');
  if (s.disk) {
    const { rIn, rOut, opacity, peakTemperature } = s.disk;
    if (!(rIn > 3 * s.M && rOut > rIn && Number.isFinite(rOut))) {
      throw new RangeError('disk needs 3M < rIn < rOut');
    }
    if (!(opacity >= 0 && opacity <= 1)) throw new RangeError('opacity must be in [0, 1]');
    if (!(peakTemperature > 0 && Number.isFinite(peakTemperature))) {
      throw new RangeError('peak temperature must be positive');
    }
  }
}

export function renderImage(s: RenderSettings): RenderOutput {
  validate(s);
  const frame = cameraFrame(s.camera, s.M);
  const gObserver = s.M > 0 ? staticObserverFactor(s.camera.distance, s.M) : 1;
  const n = s.samplesPerAxis;
  const weight = 1 / (n * n);
  const linear = new Float64Array(s.width * s.height * 3);
  const stats = { escaped: 0, captured: 0, stepLimit: 0, nonFinite: 0 };

  for (let j = 0; j < s.height; j++) {
    for (let i = 0; i < s.width; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const d = pixelDirection(
            frame,
            s.width,
            s.height,
            i + (sx + 0.5) / n,
            j + (sy + 0.5) / n,
          );
          const ray = traceRay(s.M, frame.position, d, { dphi: s.dphi, maxSteps: s.maxSteps });
          stats[ray.termination]++;
          let c: Vec3;
          if (s.mode === 'termination') {
            c = TERMINATION_COLOURS[ray.termination];
          } else {
            c = shade(s, ray, gObserver);
          }
          if (!c.every(Number.isFinite)) {
            stats.nonFinite++;
            c = [0, 0, 0];
          }
          r += c[0] * weight;
          g += c[1] * weight;
          b += c[2] * weight;
        }
      }
      const p = (j * s.width + i) * 3;
      linear[p] = r;
      linear[p + 1] = g;
      linear[p + 2] = b;
    }
  }
  return { width: s.width, height: s.height, linear, stats };
}

/**
 * Front-to-back compositing along the traced path (compositeDisk), then the sky (or the shadow)
 * behind whatever light the disk lets through.
 */
function shade(s: RenderSettings, ray: ReturnType<typeof traceRay>, gObserver: number): Vec3 {
  const disk = s.disk
    ? compositeDisk(
        s.disk,
        ray.crossings.map((c) => c.radius),
        ray.lzOverE,
        s.M,
        gObserver,
      )
    : { emission: [0, 0, 0] as const, transmittance: 1 };
  let [r, g, b] = disk.emission;
  const transmittance = disk.transmittance;
  if (ray.termination === 'escaped' && ray.direction && transmittance > 0) {
    const sky: Vec3 = s.sky === 'uniform' ? [1, 1, 1] : skyRadiance(ray.direction, gObserver);
    r += transmittance * sky[0];
    g += transmittance * sky[1];
    b += transmittance * sky[2];
  }
  return [r, g, b];
}

/** 8-bit sRGB pixels: tone mapped (or clamped for validation and debug views), then encoded. */
export function encodeImage(out: RenderOutput, s: RenderSettings): Uint8Array {
  const rgb = new Uint8Array(out.width * out.height * 3);
  const tone = s.toneMapping && s.mode === 'colour';
  for (let k = 0; k < rgb.length; k++) {
    const c = Math.max(0, out.linear[k] as number);
    const v = tone ? toneMap(c, s.exposure) : Math.min(1, c);
    rgb[k] = Math.min(255, Math.max(0, Math.round(srgbEncode(v) * 255)));
  }
  return rgb;
}
