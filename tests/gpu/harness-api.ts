// Contract between the GPU test harness page (tests/gpu/harness.ts) and the Playwright specs.
import type { ValidationCounts } from '../../src/gpu/host/shadow-count.ts';
import type { DiskSettings } from '../../src/physics/index.ts';

export interface HarnessInfo {
  readonly vendor: string;
  readonly architecture: string;
  readonly isFallbackAdapter: boolean;
  readonly timestampQuery: boolean;
}

export interface HarnessRay {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

export interface HarnessRayResult {
  /** 0 escaped, 1 captured, 2 step limit */
  readonly termination: number;
  readonly direction: readonly [number, number, number];
  readonly phiEnd: number;
  readonly steps: number;
  /** Disk-plane crossings with u > 0, and the radii of the first ones (at most 8). */
  readonly crossings: number;
  readonly radii: readonly number[];
  /** Disk light and remaining transmittance along the path (zero and 1 without a disk). */
  readonly emission: readonly [number, number, number];
  readonly transmittance: number;
}

export interface HarnessImageRequest {
  readonly width: number;
  readonly height: number;
  readonly camera: { distance: number; azimuthDeg: number; elevationDeg: number; fovYDeg: number };
  readonly mode: 'colour' | 'termination';
  readonly sky: 'stars' | 'uniform';
  readonly exposure: number;
  readonly toneMapping: boolean;
  readonly disk: DiskSettings | null;
  readonly antialias: boolean;
  /** See SceneParams.aaThreshold. */
  readonly aaThreshold?: number;
}

export interface HarnessImage {
  /** 8-bit RGB after the tone-mapping blit, row-major. */
  readonly rgb: number[];
  /** Samples behind each pixel: 1, or 9 where anti-aliasing refined it. */
  readonly samples: number[];
}

export interface HarnessBenchmark {
  readonly timestampQuery: boolean;
  readonly traceMs: number[];
  /** Empty when anti-aliasing is off. */
  readonly refineMs: number[];
  readonly previewHalfMs: number[];
  readonly previewQuarterMs: number[];
  /** First submission until the queue drains, both passes. */
  readonly wallMs: number[];
  /** Fraction of pixels the anti-aliasing pass refined. */
  readonly refinedFraction: number;
}

export interface HarnessShadowRequest {
  readonly distance: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly fovYDeg: number;
  /** Side of the square validation render in pixels. */
  readonly side: number;
  /** Time each pass with timestamp queries (bench only). */
  readonly timed?: boolean;
}

export interface HarnessShadowResult {
  readonly counts: ValidationCounts;
  /** GPU milliseconds of the colour and termination passes, when timed. */
  readonly gpuMs?: readonly [number, number];
  /** Wall-clock milliseconds of the readback (mapAsync), when timed. */
  readonly readbackMs?: number;
  /** Milliseconds spent classifying the readback in the page. */
  readonly classifyMs: number;
}

export interface Harness {
  readonly ready: Promise<HarnessInfo>;
  /**
   * Traces rays (mass 1) with an optional disk, through the shipped WGSL. All rays must start at
   * the same distance, which sets the static observer's frequency factor.
   */
  traceRays(rays: readonly HarnessRay[], disk?: DiskSettings | null): Promise<HarnessRayResult[]>;
  /** Sky radiance for unit directions as seen with frequency shift g. */
  skyRadiance(
    directions: readonly (readonly [number, number, number])[],
    g: number,
  ): Promise<number[][]>;
  /** Full GPU path (compute, then the tone-mapping blit) into an 8-bit RGBA texture, read back. */
  renderImage(request: HarnessImageRequest): Promise<HarnessImage>;
  /**
   * The same, as base64 of the RGB bytes (compact for large images). With previewScale, the
   * image is the upscaled preview the page shows while the view changes.
   */
  renderImageBase64(request: HarnessImageRequest, previewScale?: number): Promise<string>;
  /**
   * Renders the full image `repeats` times after a warm-up run, and a preview at 1/2 and 1/4
   * scale after each. Milliseconds are GPU time from timestamp queries when available (else
   * wall-clock): for a pass, from the start of its first tile to the end of its last.
   */
  benchmark(request: HarnessImageRequest, repeats: number): Promise<HarnessBenchmark>;
  /**
   * The Validation panel's measurement: the colour validation render (disk off, uniform sky, no
   * tone mapping, one sample per pixel) and the termination render of the same view, offscreen,
   * classified in the page.
   */
  measureShadow(request: HarnessShadowRequest): Promise<HarnessShadowResult>;
  /**
   * Renders `image`, reads it back, runs `shadow`, and reads the image back again: whether the
   * measurement left the interactive images untouched.
   */
  measurementIsolation(
    image: HarnessImageRequest,
    shadow: HarnessShadowRequest,
  ): Promise<{ identical: boolean; bytes: number }>;
}

declare global {
  interface Window {
    harness?: Harness;
  }
}
