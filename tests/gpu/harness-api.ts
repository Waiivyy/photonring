// Contract between the GPU test harness page (tests/gpu/harness.ts) and the Playwright specs.
import type { ValidationCounts } from '../../src/gpu/host/shadow-count.ts';
import type { RenderMode, Sky } from '../../src/gpu/host/wgsl.ts';
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
  readonly mode: RenderMode;
  readonly sky: Sky;
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

export interface HarnessEhtImage {
  /** Base64 of the 8-bit RGB after the blit (the EHT post-process in the EHT-style view). */
  readonly rgb: string;
  /** Base64 of the first pass's red channel as little-endian Float32 (the linear brightness). */
  readonly linear: string;
  /** The peak the present was normalised to. */
  readonly peak: number;
  /** Whether the present left the first pass and the anti-aliased pixels unchanged. */
  readonly untouched: boolean;
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
  /** GPU milliseconds of the colour and termination passes, when timed; NaN for a rejected span. */
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
  traceRays(
    rays: readonly HarnessRay[],
    disk?: DiskSettings | null,
    mode?: RenderMode,
  ): Promise<HarnessRayResult[]>;
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
   * Renders the image (and, with previewScale, a preview presented instead of the full image),
   * then reads the presented image, the linear first pass and the normalisation peak.
   */
  renderEht(request: HarnessImageRequest, previewScale?: number): Promise<HarnessEhtImage>;
  /**
   * Renders the photon subring strip (mode 'subrings') and returns the presented 8-bit RGB and the
   * first pass's alpha channel (image order plus one on the disk, 0 elsewhere), both base64
   * (the alpha as little-endian Float32).
   */
  renderStrip(request: HarnessImageRequest): Promise<{ rgb: string; order: string }>;
  /**
   * Renders the full image `repeats` times after a warm-up run, and a preview at 1/2 and 1/4
   * scale after each. Milliseconds are GPU time from timestamp queries when available (else
   * wall-clock): for a pass, from the start of its first tile to the end of its last. A repeat
   * whose span was rejected (src/gpu/host/timestamps.ts) gives NaN.
   */
  benchmark(request: HarnessImageRequest, repeats: number): Promise<HarnessBenchmark>;
  /**
   * Renders the image once, then times `repeats` presents of it (the EHT post-process and blit,
   * or the tone-mapping blit), after ten warm-up presents whose times are discarded. `factor`
   * fixes the EHT reduce. `timing` is the device's clock; with timestamp queries a repeat whose
   * span was rejected gives NaN, so `ms` never mixes the two clocks.
   */
  benchmarkPresent(
    request: HarnessImageRequest,
    repeats: number,
    factor?: number,
  ): Promise<{ timing: string; ms: number[] }>;
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
