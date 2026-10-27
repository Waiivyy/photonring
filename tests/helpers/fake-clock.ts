// A deterministic clock with timers and animation frames, for testing timing logic without
// waiting: advance(ms) runs every due timer in time order.
export interface FakeClock {
  readonly now: () => number;
  readonly setTimer: (fn: () => void, ms: number) => number;
  readonly clearTimer: (id: number) => void;
  readonly requestFrame: (fn: (t: number) => void) => number;
  readonly cancelFrame: (id: number) => void;
  /** Runs due timers in order while moving time forward by ms. */
  readonly advance: (ms: number) => void;
  /** Runs the pending animation frames once, at the current time. */
  readonly runFrames: () => void;
  readonly pendingTimers: number;
  readonly pendingFrames: number;
}

export function fakeClock(start = 0): FakeClock {
  let t = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const frames = new Map<number, (t: number) => void>();
  return {
    now: () => t,
    setTimer(fn, ms) {
      const id = nextId++;
      // Like setTimeout, whose delay is a whole number of ms: fractions are dropped.
      timers.set(id, { at: t + Math.max(0, Math.trunc(ms)), fn });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    requestFrame(fn) {
      const id = nextId++;
      frames.set(id, fn);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let due: [number, { at: number; fn: () => void }] | null = null;
        for (const entry of timers) {
          if (entry[1].at <= end && (due === null || entry[1].at < due[1].at)) due = entry;
        }
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].fn();
      }
      t = end;
    },
    runFrames() {
      const pending = [...frames];
      frames.clear();
      for (const [, fn] of pending) fn(t);
    },
    get pendingTimers() {
      return timers.size;
    },
    get pendingFrames() {
      return frames.size;
    },
  };
}
