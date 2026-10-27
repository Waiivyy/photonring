// Pointer and wheel gestures (Stage 4 touch controls): drags and pinches are computed from the
// state at the start of the gesture, so motion below the URL's precision is never lost.
import { describe, expect, it } from 'vitest';
import { dragOrbit, pinchFactor, wheelFactor } from '../../src/ui/gestures.ts';
import { initialOrbit, zoomBy } from '../../src/ui/orbit.ts';

describe('gestures', () => {
  it('a drag orbits by a quarter degree per pixel of total movement', () => {
    const s = dragOrbit(initialOrbit, 40, -20);
    expect(s.azimuthDeg).toBe(350);
    expect(s.elevationDeg).toBe(7);
  });

  it('many tiny drag steps add up when computed from the start', () => {
    let total = 0;
    let s = initialOrbit;
    for (let i = 0; i < 100; i++) {
      total += 0.01; // 0.0025 degrees per event: below the 0.01 degree precision
      s = dragOrbit(initialOrbit, total, 0);
    }
    expect(s.azimuthDeg).toBe(359.75);
  });

  it('pinch factor: spreading the fingers zooms in, degenerate input is ignored', () => {
    expect(pinchFactor(100, 200)).toBe(0.5);
    expect(pinchFactor(200, 100)).toBe(2);
    expect(pinchFactor(0, 100)).toBeNull();
    expect(pinchFactor(100, 0)).toBeNull();
    expect(pinchFactor(NaN, 100)).toBeNull();
    expect(pinchFactor(100, Infinity)).toBeNull();
  });

  it('a slow pinch at 5.5 M moves the camera when applied to the start distance', () => {
    const start = { ...initialOrbit, distance: 5.5 };
    let stepwise = start;
    let cumulative = 1;
    for (let i = 0; i < 1000; i++) {
      const f = 0.99999;
      stepwise = zoomBy(stepwise, f); // each step rounds back: the camera sticks
      cumulative *= f;
    }
    expect(stepwise.distance).toBe(5.5);
    expect(zoomBy(start, cumulative).distance).toBe(5.445);
  });

  it('wheel factor: pixels, lines and pages, clamped per event', () => {
    expect(wheelFactor(100, 0, 800)).toBeCloseTo(Math.exp(0.1), 12);
    expect(wheelFactor(3, 1, 800)).toBeCloseTo(Math.exp(3 * 16 * 0.001), 12);
    expect(wheelFactor(1, 2, 400)).toBeCloseTo(Math.exp(0.4), 12);
    expect(wheelFactor(1e6, 0, 800)).toBe(2);
    expect(wheelFactor(-1e6, 0, 800)).toBe(0.5);
    expect(wheelFactor(NaN, 0, 800)).toBeNull();
    expect(wheelFactor(10, 7, 800)).toBeNull();
  });
});
