// File names of saved images (Stage 4): the view they show, at the URL's precision, ASCII only.
import { describe, expect, it } from 'vitest';
import { screenshotName } from '../../src/ui/screenshot-name.ts';

describe('saved image file name', () => {
  it('names the default view', () => {
    expect(screenshotName({ distance: 30, azimuthDeg: 0, elevationDeg: 12, view: 'colour' })).toBe(
      'photonring-r30-az0-el12.png',
    );
  });

  it('rounds like the URL and marks the termination view', () => {
    expect(
      screenshotName({
        distance: 27.2727,
        azimuthDeg: 355,
        elevationDeg: -20,
        view: 'termination',
      }),
    ).toBe('photonring-r27.273-az355-el-20-termination.png');
    expect(
      screenshotName({ distance: 5, azimuthDeg: 359.996, elevationDeg: -0.001, view: 'colour' }),
    ).toBe('photonring-r5-az0-el0.png');
    expect(
      screenshotName({ distance: 200, azimuthDeg: 12.345, elevationDeg: 89.999, view: 'colour' }),
    ).toBe('photonring-r200-az12.35-el90.png');
  });

  it('uses only lower-case letters, digits, dots and hyphens', () => {
    for (const [d, a, e] of [
      [5.5, 0.01, -90],
      [123.456, 270.5, 45.25],
      [30, -0, -0],
    ] as const) {
      const n = screenshotName({
        distance: d,
        azimuthDeg: a,
        elevationDeg: e,
        view: 'termination',
      });
      expect(n).toMatch(/^[a-z0-9.-]+$/);
      expect(n.endsWith('.png')).toBe(true);
    }
  });
});
