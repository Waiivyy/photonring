// Orbit camera state: pure updates with clamping (pointer, wheel, pinch and keyboard all use these).
import { describe, expect, it } from 'vitest';
import { ORBIT_LIMITS, initialOrbit, orbitBy, viewCamera, zoomBy } from '../../src/ui/orbit.ts';

describe('orbit camera state', () => {
  it('starts at the default view: 30 M, slightly above the disk plane', () => {
    expect(initialOrbit.distance).toBe(30);
    expect(initialOrbit.elevationDeg).toBeGreaterThan(0);
  });

  it('wraps azimuth and clamps elevation at the poles', () => {
    const s = orbitBy({ ...initialOrbit, azimuthDeg: 350, elevationDeg: 80 }, 20, 30);
    expect(s.azimuthDeg).toBeCloseTo(10, 12);
    expect(s.elevationDeg).toBe(90);
    expect(orbitBy(s, 0, -500).elevationDeg).toBe(-90);
  });

  it('zooms multiplicatively within the allowed distances', () => {
    expect(zoomBy(initialOrbit, 0.5).distance).toBe(15);
    expect(zoomBy(initialOrbit, 1e-6).distance).toBe(ORBIT_LIMITS.minDistance);
    expect(zoomBy(initialOrbit, 1e6).distance).toBe(ORBIT_LIMITS.maxDistance);
  });

  it('ignores non-finite input instead of corrupting the state', () => {
    expect(orbitBy(initialOrbit, NaN, Infinity)).toEqual(initialOrbit);
    expect(zoomBy(initialOrbit, NaN)).toEqual(initialOrbit);
    expect(zoomBy(initialOrbit, -2)).toEqual(initialOrbit);
  });

  it('widens the field of view automatically close to the hole', () => {
    expect(viewCamera(initialOrbit).fovYDeg).toBe(60);
    expect(viewCamera({ ...initialOrbit, distance: 5 }).fovYDeg).toBe(120);
  });
});
