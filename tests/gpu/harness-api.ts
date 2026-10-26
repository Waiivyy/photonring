// Contract between the GPU test harness page (tests/gpu/harness.ts) and the Playwright specs.

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
}

export interface HarnessImageRequest {
  readonly width: number;
  readonly height: number;
  readonly camera: { distance: number; azimuthDeg: number; elevationDeg: number; fovYDeg: number };
  readonly mode: 'colour' | 'termination';
  readonly sky: 'stars' | 'uniform';
  readonly exposure: number;
  readonly toneMapping: boolean;
}

export interface Harness {
  readonly ready: Promise<HarnessInfo>;
  traceRays(rays: readonly HarnessRay[]): Promise<HarnessRayResult[]>;
  /** Sky radiance for unit directions as seen with frequency shift g. */
  skyRadiance(
    directions: readonly (readonly [number, number, number])[],
    g: number,
  ): Promise<number[][]>;
  /** Full GPU path (compute, then the tone-mapping blit) into an 8-bit RGBA texture, read back as RGB. */
  renderImage(request: HarnessImageRequest): Promise<number[]>;
  /**
   * Renders the full image `repeats` times. Returns, per run, the GPU time between the start of
   * the first tile pass and the end of the last (timestamp queries; null without them) and the
   * wall-clock time from the first submission until the queue drains.
   */
  benchmark(
    request: HarnessImageRequest,
    repeats: number,
  ): Promise<{ gpuMs: (number | null)[]; wallMs: number[] }>;
}

declare global {
  interface Window {
    harness?: Harness;
  }
}
