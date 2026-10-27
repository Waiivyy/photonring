// One limiter for the two toggles that change the brightness of the whole image: the disk and
// the termination view. Requests from keys, checkboxes and the URL all pass through it. A change
// from rest applies at once; changes within INTERVAL_MS of the last apply are coalesced into one
// trailing apply of the latest request. Consecutive applies are therefore at least 500 ms apart:
// at most 3 in any closed one-second window and 2 flashes per second, below WCAG 2.3.1's 3.
import type { ViewMode } from './view-state.ts';

export interface BrightnessPair {
  readonly disk: boolean;
  readonly view: ViewMode;
}

export interface LimiterDeps {
  now(): number;
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
}

export interface BrightnessLimiter {
  request(pair: BrightnessPair): void;
  /** Sets both pairs at once without counting a change (first image, restart). */
  reset(pair: BrightnessPair): void;
  /** Nothing scheduled, and the applied pair is the requested one. */
  isIdle(): boolean;
  dispose(): void;
  readonly requested: BrightnessPair;
  readonly applied: BrightnessPair;
  readonly applies: number;
  /** Times of the last 16 applies. */
  readonly applyTimes: readonly number[];
}

export const INTERVAL_MS = 500;
const KEEP_TIMES = 16;

const same = (a: BrightnessPair, b: BrightnessPair) => a.disk === b.disk && a.view === b.view;

export function createBrightnessLimiter(
  initial: BrightnessPair,
  apply: (pair: BrightnessPair) => void,
  deps: LimiterDeps,
): BrightnessLimiter {
  let requested = initial;
  let applied = initial;
  let lastApply = -Infinity;
  let timer: number | null = null;
  let applies = 0;
  const times: number[] = [];

  const doApply = () => {
    applied = requested;
    lastApply = deps.now();
    applies++;
    times.push(lastApply);
    if (times.length > KEEP_TIMES) times.shift();
    apply(applied);
  };
  const trailing = () => {
    timer = null;
    if (!same(requested, applied)) doApply();
  };

  return {
    request(pair) {
      requested = pair;
      if (timer !== null) return;
      if (same(requested, applied)) return;
      const wait = lastApply + INTERVAL_MS - deps.now();
      if (wait <= 0) doApply();
      else timer = deps.setTimer(trailing, wait);
    },
    reset(pair) {
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
      requested = pair;
      applied = pair;
    },
    isIdle: () => timer === null && same(requested, applied),
    dispose() {
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
    },
    get requested() {
      return requested;
    },
    get applied() {
      return applied;
    },
    get applies() {
      return applies;
    },
    get applyTimes() {
      return times;
    },
  };
}
