// Rounding of the view state to the precision of the URL (Stage 4): the camera the app renders,
// the HUD, the hash and the saved file name all describe the same, exactly representable view.
import { describe, expect, it } from 'vitest';
import { formatNumber, quantise, quantiseOrbit } from '../../src/ui/quantise.ts';
import { ORBIT_LIMITS, initialOrbit } from '../../src/ui/orbit.ts';

describe('number formatting', () => {
  it('rounds like toFixed and strips trailing zeros and a trailing point', () => {
    expect(formatNumber(30, 3)).toBe('30');
    expect(formatNumber(27.272727, 3)).toBe('27.273');
    expect(formatNumber(12.5, 2)).toBe('12.5');
    expect(formatNumber(0.1 + 0.2, 2)).toBe('0.3');
    expect(formatNumber(-20, 2)).toBe('-20');
    expect(formatNumber(359.99, 2)).toBe('359.99');
    expect(formatNumber(1.005, 2)).toBe((1.005).toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
  });

  it('writes negative zero, and values that round to zero, as 0', () => {
    expect(formatNumber(-0, 2)).toBe('0');
    expect(formatNumber(-0.001, 2)).toBe('0');
    expect(Object.is(quantise(-0.001, 2), 0)).toBe(true);
  });

  it('quantise is idempotent and formats back to the same string', () => {
    for (const x of [27.2727, 359.995, -12.345678, 199.99951, 5.0004, 0.005]) {
      for (const d of [2, 3]) {
        const q = quantise(x, d);
        expect(quantise(q, d)).toBe(q);
        expect(formatNumber(q, d)).toBe(formatNumber(x, d));
      }
    }
  });
});

describe('quantised orbit', () => {
  it('rounds the distance to 3 decimals and the angles to 2', () => {
    const q = quantiseOrbit({
      ...initialOrbit,
      distance: 27.2727272,
      azimuthDeg: 12.3456,
      elevationDeg: -7.891,
    });
    expect(q).toEqual({
      ...initialOrbit,
      distance: 27.273,
      azimuthDeg: 12.35,
      elevationDeg: -7.89,
    });
  });

  it('wraps the azimuth after rounding, so 360 is never produced', () => {
    expect(quantiseOrbit({ ...initialOrbit, azimuthDeg: 359.995 }).azimuthDeg).toBe(0);
    expect(quantiseOrbit({ ...initialOrbit, azimuthDeg: 359.996 }).azimuthDeg).toBe(0);
    expect(quantiseOrbit({ ...initialOrbit, azimuthDeg: 359.994 }).azimuthDeg).toBe(359.99);
    expect(quantiseOrbit({ ...initialOrbit, azimuthDeg: -0.001 }).azimuthDeg).toBe(0);
    expect(quantiseOrbit({ ...initialOrbit, azimuthDeg: -725 }).azimuthDeg).toBe(355);
  });

  it('keeps every value within its limits', () => {
    const q = quantiseOrbit({ ...initialOrbit, distance: 1e9, elevationDeg: 95 });
    expect(q.distance).toBe(ORBIT_LIMITS.maxDistance);
    expect(q.elevationDeg).toBe(90);
    const r = quantiseOrbit({ ...initialOrbit, distance: 4.9996, elevationDeg: -90.004 });
    expect(r.distance).toBe(ORBIT_LIMITS.minDistance);
    expect(r.elevationDeg).toBe(-90);
  });

  it('is idempotent', () => {
    const q = quantiseOrbit({
      ...initialOrbit,
      distance: 33.33333,
      azimuthDeg: 359.9951,
      elevationDeg: 45.555,
    });
    expect(quantiseOrbit(q)).toEqual(q);
  });
});
