// Progressive refinement for the interactive page. While the scene changes, each frame shows a
// complete image at a resolution that fits the frame budget (full resolution if it fits, else a
// reduced-resolution preview). Once nothing has changed for settleMs, the full-resolution first
// pass runs tile by tile, then anti-aliasing. Pure logic: times are passed in, and the caller
// reports each batch's measured cost back through completed().
import { TileScheduler, planTiles, type Tile } from './tiles.ts';

export interface ProgressiveOptions {
  /** GPU time per animation frame to aim for, in milliseconds. */
  readonly budgetMs: number;
  /** Quiet time after the last change before full-resolution work starts. */
  readonly settleMs: number;
  readonly tileSize: number;
}

/** What to show after this frame's work: the upscaled preview, the full image, or no change. */
export type Present = 'preview' | 'full' | null;

export type FrameAction =
  | { readonly kind: 'idle'; readonly present: null }
  | {
      readonly kind: 'preview';
      /** Fraction of the full resolution per axis. */
      readonly scale: number;
      readonly reset: boolean;
      readonly present: Present;
    }
  | {
      readonly kind: 'trace' | 'refine';
      readonly tiles: readonly Tile[];
      readonly reset: boolean;
      readonly present: Present;
    };

export type Stage = 'preview' | 'trace' | 'refine' | 'done';

const PREVIEW_MIN = 0.25;
const PREVIEW_MAX = 0.5;

/**
 * Resolution scale for frames during interaction: 1 when a full one-sample frame is estimated to
 * fit the budget; otherwise the largest multiple of 1/8 from 1/4 to 1/2 whose frame fits (1/4 if
 * none does); 1/2 before any cost has been measured.
 */
export function choosePreviewScale(
  msPerPixel: number | null,
  pixels: number,
  budgetMs: number,
): number {
  if (msPerPixel === null) return PREVIEW_MAX;
  const fullMs = msPerPixel * pixels;
  if (fullMs <= budgetMs) return 1;
  const fit = Math.floor(Math.sqrt(budgetMs / fullMs) * 8) / 8;
  return Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, fit));
}

const IDLE: FrameAction = { kind: 'idle', present: null };

export class ProgressiveRenderer {
  private readonly options: ProgressiveOptions;
  private readonly trace = new TileScheduler();
  private readonly refine = new TileScheduler();
  private w: number;
  private h: number;
  private changed = false;
  private lastChange = -Infinity;
  private antialias = false;
  private current: Stage = 'done';
  private inFlight: FrameAction | null = null;
  private refineQueued = false;

  constructor(width: number, height: number, options: ProgressiveOptions) {
    this.w = width;
    this.h = height;
    this.options = options;
  }

  get width(): number {
    return this.w;
  }

  get height(): number {
    return this.h;
  }

  get stage(): Stage {
    return this.current;
  }

  get done(): boolean {
    return this.current === 'done' && this.inFlight === null;
  }

  get remaining(): { trace: number; refine: number } {
    return { trace: this.trace.remaining, refine: this.refine.remaining };
  }

  /** Measured cost of the first pass per pixel (previews included), if known. */
  get traceMsPerPixel(): number | null {
    return this.trace.msPerPixel;
  }

  /** The scene (camera, mode, disk, anti-aliasing) changed at time `now`. */
  sceneChanged(now: number, antialias: boolean): void {
    this.changed = true;
    this.lastChange = now;
    this.antialias = antialias;
    // Until the next frame chooses between a preview and a full-resolution frame.
    this.current = 'preview';
  }

  /** The image size changed: everything starts over at the new size. */
  resize(width: number, height: number, now: number): void {
    this.w = width;
    this.h = height;
    this.sceneChanged(now, this.antialias);
  }

  /** Work for the frame at time `now`. At most one batch is in flight at a time. */
  next(now: number): FrameAction {
    if (this.inFlight) return IDLE;
    if (this.changed) {
      this.changed = false;
      this.trace.reset([]);
      this.refine.reset([]);
      this.refineQueued = false;
      const pixels = this.w * this.h;
      const scale = choosePreviewScale(this.trace.msPerPixel, pixels, this.options.budgetMs);
      if (scale < 1) {
        this.current = 'preview';
        return this.dispatch({ kind: 'preview', scale, reset: true, present: 'preview' });
      }
      this.current = 'trace';
      this.trace.reset(this.tiles());
      return this.takeTrace(true);
    }
    const settled = now - this.lastChange >= this.options.settleMs;
    switch (this.current) {
      case 'preview':
        if (!settled) return IDLE;
        this.current = 'trace';
        this.trace.reset(this.tiles());
        return this.takeTrace(false);
      case 'trace':
        return this.takeTrace(false);
      case 'refine':
        if (!settled) return IDLE;
        if (!this.refineQueued) {
          this.refine.reset(this.tiles());
          this.refineQueued = true;
        }
        return this.dispatch({
          kind: 'refine',
          tiles: this.refine.takeForFrame(this.options.budgetMs),
          reset: false,
          present: 'full',
        });
      case 'done':
        return IDLE;
    }
  }

  /** Reports the measured GPU (or wall-clock) milliseconds of the batch `action` started. */
  completed(action: FrameAction, ms: number): void {
    if (action !== this.inFlight) return;
    this.inFlight = null;
    if (action.kind === 'preview') {
      const pixels = Math.ceil(this.w * action.scale) * Math.ceil(this.h * action.scale);
      this.trace.recordCost(pixels, ms);
    } else if (action.kind === 'trace' || action.kind === 'refine') {
      const pixels = action.tiles.reduce((n, t) => n + t.width * t.height, 0);
      (action.kind === 'trace' ? this.trace : this.refine).recordCost(pixels, ms);
      if (action.kind === 'refine' && this.refine.done) this.current = 'done';
    }
  }

  private tiles(): Tile[] {
    return planTiles(this.w, this.h, this.options.tileSize);
  }

  private takeTrace(reset: boolean): FrameAction {
    const tiles = this.trace.takeForFrame(this.options.budgetMs);
    const finished = this.trace.done;
    if (finished) this.current = this.antialias ? 'refine' : 'done';
    return this.dispatch({ kind: 'trace', tiles, reset, present: finished ? 'full' : null });
  }

  private dispatch(action: FrameAction): FrameAction {
    this.inFlight = action;
    return action;
  }
}
