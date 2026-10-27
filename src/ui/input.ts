// Pointer, wheel and keyboard input on the canvas. Drags, pinches and wheel bursts are applied to
// the orbit at the start of the gesture (start plus total movement), so motion below the URL's
// precision adds up; a gesture that runs into a limit (a pole, the nearest or farthest distance)
// starts again from there, so reversing it moves the camera at once.
import { dragOrbit, pinchFactor, wheelFactor } from './gestures.ts';
import type { Lifecycle } from './lifecycle.ts';
import { ORBIT_LIMITS, zoomBy, type OrbitState } from './orbit.ts';

export interface InputHandlers {
  orbit(): OrbitState;
  setOrbit(next: OrbitState): void;
  /** Returns whether the key was handled (then its default action is prevented). */
  key(e: KeyboardEvent): boolean;
}

/** Quiet time that ends a burst of wheel events. */
const WHEEL_BURST_MS = 150;

interface Gesture {
  start: OrbitState;
  /** Drag: pointer position at the start. Pinch: finger spacing at the start. */
  x: number;
  y: number;
  spacing: number;
}

export function bindCanvasInput(
  canvas: HTMLCanvasElement,
  h: InputHandlers,
  life: Lifecycle,
): void {
  const signal = life.signal;
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: Gesture | null = null;

  const spacing = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  /** Starts the gesture again from the current orbit and pointers (one or two of them). */
  const anchor = () => {
    const first = [...pointers.values()][0];
    gesture = first ? { start: h.orbit(), x: first.x, y: first.y, spacing: spacing() } : null;
  };

  canvas.addEventListener(
    'pointerdown',
    (e) => {
      canvas.focus({ preventScroll: true });
      if (pointers.size >= 2) return; // a third finger is ignored
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Capture can fail for synthetic or already released pointers; dragging still works.
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      anchor();
    },
    { signal },
  );
  canvas.addEventListener(
    'pointermove',
    (e) => {
      if (!pointers.has(e.pointerId) || !gesture) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture;
      if (pointers.size === 1) {
        const next = dragOrbit(g.start, e.clientX - g.x, e.clientY - g.y);
        h.setOrbit(next);
        if (Math.abs(next.elevationDeg) === 90) anchor();
      } else {
        const f = pinchFactor(g.spacing, spacing());
        if (f === null) return;
        const next = zoomBy(g.start, f);
        h.setOrbit(next);
        if (
          next.distance === ORBIT_LIMITS.minDistance ||
          next.distance === ORBIT_LIMITS.maxDistance
        ) {
          anchor();
        }
      }
    },
    { signal },
  );
  const release = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    anchor();
  };
  canvas.addEventListener('pointerup', release, { signal });
  canvas.addEventListener('pointercancel', release, { signal });

  let burst: { start: OrbitState; factor: number; timer: number } | null = null;
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const f = wheelFactor(e.deltaY, e.deltaMode, canvas.clientHeight);
      if (f === null) return;
      if (burst) life.cancel(burst.timer);
      const b = burst ?? { start: h.orbit(), factor: 1, timer: -1 };
      b.factor *= f;
      const next = zoomBy(b.start, b.factor);
      h.setOrbit(next);
      const atLimit =
        next.distance === ORBIT_LIMITS.minDistance || next.distance === ORBIT_LIMITS.maxDistance;
      b.timer = life.timeout(() => (burst = null), WHEEL_BURST_MS);
      burst = atLimit ? null : b;
    },
    { passive: false, signal },
  );

  canvas.addEventListener(
    'keydown',
    (e) => {
      if (h.key(e)) e.preventDefault();
    },
    { signal },
  );
}
