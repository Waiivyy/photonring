// When the Validation panel measures: only while it is open, once per presented camera, after
// the image is complete, one measurement at a time. A result that arrives after the camera
// changed (or after the panel closed) is discarded: not shown, counted or announced. The camera
// asked for counts, not only the one presented, because a readback usually resolves before the
// next frame presents a new camera. A return to the camera last measured shows its result again.
// Pure: the GPU measurement, the panel and the requested camera are injected.
import type { CameraParams } from '../physics/index.ts';
import type { ShadowResult } from './validation.ts';

export interface SchedulerDeps {
  measure(camera: CameraParams): Promise<ShadowResult>;
  pending(state: 'waiting' | 'measuring', camera: CameraParams): void;
  /** `fresh` is true for a new measurement (count and announce it), false when shown again. */
  done(result: ShadowResult, fresh: boolean): void;
  failed(): void;
  now(): number;
  /** The camera the page is showing or about to show (what the controls asked for). */
  current(): CameraParams | null;
}

export interface ValidationScheduler {
  /** Called every frame: whether the panel is open, the presented camera, image complete. */
  update(open: boolean, camera: CameraParams | null, settled: boolean): void;
  close(): void;
  readonly runs: number;
  /** Wall-clock ms of the last accepted measurement, from request to result. */
  readonly lastMs: number;
  readonly last: ShadowResult | null;
}

const keyOf = (c: CameraParams) => `${c.distance}|${c.azimuthDeg}|${c.elevationDeg}|${c.fovYDeg}`;

export function createValidationScheduler(deps: SchedulerDeps): ValidationScheduler {
  let shown = '';
  let measuring = '';
  let gen = 0;
  let presentedKey = '';
  let last: { key: string; result: ShadowResult } | null = null;
  let runs = 0;
  let lastMs = 0;

  /** Whether a result for `key` still describes the view. */
  const stillCurrent = (g: number, key: string) => {
    const c = deps.current();
    return g === gen && key === presentedKey && c !== null && keyOf(c) === key;
  };
  const show = (key: string, camera: CameraParams) => {
    shown = key;
    if (last && last.key === key) deps.done(last.result, false);
    else deps.pending(measuring === key ? 'measuring' : 'waiting', camera);
  };

  return {
    update(open, camera, settled) {
      if (!open || !camera) return;
      const key = keyOf(camera);
      presentedKey = key;
      if (key !== shown) show(key, camera);
      if (!settled || measuring !== '' || (last && last.key === key)) return;
      measuring = key;
      const g = ++gen;
      const t0 = deps.now();
      deps.pending('measuring', camera);
      deps.measure(camera).then(
        (result) => {
          measuring = '';
          if (!stillCurrent(g, key)) return;
          runs++;
          lastMs = deps.now() - t0;
          last = { key, result };
          shown = key;
          deps.done(result, true);
        },
        () => {
          measuring = '';
          if (!stillCurrent(g, key)) return;
          deps.failed();
        },
      );
    },
    close() {
      // Discards a measurement in flight; the last result stays (shown again for its camera).
      gen++;
      shown = '';
      presentedKey = '';
    },
    get runs() {
      return runs;
    },
    get lastMs() {
      return lastMs;
    },
    get last() {
      return last?.result ?? null;
    },
  };
}
