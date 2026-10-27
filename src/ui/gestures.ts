// Pointer and wheel gestures as pure functions. A drag or pinch is applied to the orbit at the
// start of the gesture (start plus total movement), so motion below the URL's precision adds up
// instead of being rounded away event by event.
import { orbitBy, type OrbitState } from './orbit.ts';

/** Degrees of orbit per CSS pixel of drag. */
export const DRAG_DEG_PER_PX = 0.25;
/** Zoom per pixel of wheel movement: factor exp(px * WHEEL_PER_PX). */
export const WHEEL_PER_PX = 0.001;
const LINE_PX = 16;

/** The orbit after dragging by (dx, dy) CSS px in total since `start`. */
export function dragOrbit(start: OrbitState, dx: number, dy: number): OrbitState {
  return orbitBy(start, -dx * DRAG_DEG_PER_PX, dy * DRAG_DEG_PER_PX);
}

/** Distance factor for a pinch whose finger spacing went from `startPx` to `currentPx`. */
export function pinchFactor(startPx: number, currentPx: number): number | null {
  if (!(Number.isFinite(startPx) && Number.isFinite(currentPx) && startPx > 0 && currentPx > 0)) {
    return null;
  }
  return startPx / currentPx;
}

/** Distance factor for one wheel event (deltaMode 0 pixels, 1 lines, 2 pages), clamped. */
export function wheelFactor(deltaY: number, deltaMode: number, pageHeight: number): number | null {
  const unit = deltaMode === 0 ? 1 : deltaMode === 1 ? LINE_PX : deltaMode === 2 ? pageHeight : NaN;
  const px = deltaY * unit;
  if (!Number.isFinite(px)) return null;
  return Math.min(2, Math.max(0.5, Math.exp(px * WHEEL_PER_PX)));
}
