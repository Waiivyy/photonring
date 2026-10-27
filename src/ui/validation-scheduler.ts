// When the Validation panel measures: only while it is open, once per presented camera, after
// the image is complete, one measurement at a time. A result that arrives after the presented
// camera changed (or after the panel closed) is discarded: not shown, counted or announced. A
// return to the camera last measured shows its result again. Pure: the GPU measurement and the
// panel are injected.
import type { CameraParams } from '../physics/index.ts';
import type { ShadowResult } from './validation.ts';

export interface SchedulerDeps {
  measure(camera: CameraParams): Promise<ShadowResult>;
  pending(state: 'waiting' | 'measuring', camera: CameraParams): void;
  /** `fresh` is true for a new measurement (count and announce it), false when shown again. */
  done(result: ShadowResult, fresh: boolean): void;
  failed(): void;
  now(): number;
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
          if (g !== gen || key !== presentedKey) return;
          runs++;
          lastMs = deps.now() - t0;
          last = { key, result };
          shown = key;
          deps.done(result, true);
        },
        () => {
          measuring = '';
          if (g !== gen || key !== presentedKey) return;
          deps.failed();
        },
      );
    },
    close() {
      gen++;
      shown = '';
      presentedKey = '';
      last = null;
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
