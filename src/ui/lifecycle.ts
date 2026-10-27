// Owns everything the app schedules or listens to: timers, animation frames, event listeners
// (through the abort signal) and teardown hooks. dispose() releases all of it at once, so after a
// restart following device loss nothing of the old app runs again.

export interface LifecycleDeps {
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
  requestFrame(fn: (t: number) => void): number;
  cancelFrame(id: number): void;
}

export interface Lifecycle {
  /** Pass as { signal } to addEventListener; aborted on dispose. */
  readonly signal: AbortSignal;
  timeout(fn: () => void, ms: number): number;
  cancel(id: number): void;
  frame(fn: (t: number) => void): number;
  /** Runs on dispose, in reverse order of registration. */
  onDispose(fn: () => void): void;
  dispose(): void;
  readonly disposed: boolean;
}

export function createLifecycle(deps: LifecycleDeps): Lifecycle {
  const controller = new AbortController();
  const timers = new Set<number>();
  const frames = new Set<number>();
  const hooks: (() => void)[] = [];
  let disposed = false;

  return {
    signal: controller.signal,
    timeout(fn, ms) {
      if (disposed) return -1;
      const id = deps.setTimer(() => {
        timers.delete(id);
        if (!disposed) fn();
      }, ms);
      timers.add(id);
      return id;
    },
    cancel(id) {
      if (timers.delete(id)) deps.clearTimer(id);
    },
    frame(fn) {
      if (disposed) return -1;
      const id = deps.requestFrame((t) => {
        frames.delete(id);
        if (!disposed) fn(t);
      });
      frames.add(id);
      return id;
    },
    onDispose(fn) {
      if (!disposed) hooks.push(fn);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      for (const id of timers) deps.clearTimer(id);
      timers.clear();
      for (const id of frames) deps.cancelFrame(id);
      frames.clear();
      for (const hook of hooks.reverse()) {
        try {
          hook();
        } catch {
          // One failing hook must not keep the others from releasing their resources.
        }
      }
      hooks.length = 0;
    },
    get disposed() {
      return disposed;
    },
  };
}
