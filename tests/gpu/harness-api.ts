// Contract between the GPU test harness page (tests/gpu/harness.ts) and the Playwright specs.
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
   * Renders the full image `repeats` times after a warm-up run, and a preview at 1/2 and 1/4
   * scale after each. Milliseconds are GPU time from timestamp queries when available (else
   * wall-clock): for a pass, from the start of its first tile to the end of its last.
   */
  benchmark(request: HarnessImageRequest, repeats: number): Promise<HarnessBenchmark>;
}

declare global {
  interface Window {
    harness?: Harness;
  }
}
