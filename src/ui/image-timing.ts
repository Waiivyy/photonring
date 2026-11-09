// The status line's times for the image being drawn. The first pass and the anti-aliasing are
// drawn in batches over several frames; their times are the sums of the batches' times. They are
// GPU time only when the device has timestamp queries and every batch of the image got a valid
// GPU span; otherwise they are the wall-clock times of all the batches, called frame time, so one
// line never mixes the two clocks. The preview line is labelled by the last preview's own clock.
// Pure: the renderer's measurements are passed in.
import type { PassTime } from '../gpu/host/timestamps.ts';

export type TimingClock = 'GPU' | 'frame';

export interface TimingView {
  /** Clock of the first-pass and anti-aliasing sums. */
  readonly clock: TimingClock;
  readonly traceMs: number;
  readonly refineMs: number;
  /** Clock and time of the last preview. */
  readonly previewClock: TimingClock;
  readonly previewMs: number;
}

interface PassSums {
  gpuMs: number;
  wallMs: number;
  allGpu: boolean;
}

export class ImageTiming {
  private readonly gpuAvailable: boolean;
  private trace: PassSums;
  private refine: PassSums;
  private preview: PassTime | null = null;

  /** `gpuAvailable`: whether the device has timestamp queries at all. */
  constructor(gpuAvailable: boolean) {
    this.gpuAvailable = gpuAvailable;
    this.trace = this.empty();
    this.refine = this.empty();
  }

  /** Starts a new image: the first-pass and anti-aliasing sums restart. */
  reset(): void {
    this.trace = this.empty();
    this.refine = this.empty();
  }

  add(kind: 'preview' | 'trace' | 'refine', t: PassTime): void {
    if (kind === 'preview') {
      this.preview = t;
      return;
    }
    const sums = kind === 'trace' ? this.trace : this.refine;
    sums.wallMs += t.wallMs;
    if (t.gpuMs === null) sums.allGpu = false;
    else sums.gpuMs += t.gpuMs;
  }

  view(): TimingView {
    const gpu = this.trace.allGpu && this.refine.allGpu;
    const p = this.preview;
    const previewGpu = p ? p.gpuMs !== null : this.gpuAvailable;
    return {
      clock: gpu ? 'GPU' : 'frame',
      traceMs: gpu ? this.trace.gpuMs : this.trace.wallMs,
      refineMs: gpu ? this.refine.gpuMs : this.refine.wallMs,
      previewClock: previewGpu ? 'GPU' : 'frame',
      previewMs: p ? (p.gpuMs ?? p.wallMs) : 0,
    };
  }

  private empty(): PassSums {
    return { gpuMs: 0, wallMs: 0, allGpu: this.gpuAvailable };
  }
}
