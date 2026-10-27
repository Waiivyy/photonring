// Host-side anti-aliasing logic (Stage 3): the critical band around the shadow edge and the
// photon ring, and the contrast measure, both mirrored by the refinement shader.
import { describe, expect, it } from 'vitest';
import {
  AA_THRESHOLD,
  BAND_WIDTH,
  criticalBand,
  inCriticalBand,
  perceivedValue,
} from '../../src/gpu/host/antialias.ts';
import {
  autoFieldOfView,
  cameraFrame,
  criticalImpactParameter,
  pixelDirection,
  srgbEncode,
  toneMap,
  type Vec3,
} from '../../src/physics/index.ts';

const M = 1;
const BC = criticalImpactParameter(M);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Impact parameter of an inward view direction (towards the hole's hemisphere), else null. */
function inwardImpactParameter(rObs: number, e1: Vec3, d: Vec3): number | null {
  const c = -dot(d, e1);
  if (c <= 0) return null;
  return (rObs * Math.sqrt(Math.max(0, 1 - c * c))) / Math.sqrt(1 - (2 * M) / rObs);
}

describe('critical band', () => {
  const views: [distance: number, width: number, height: number][] = [
    [5, 160, 90],
    [10, 160, 90],
    [30, 480, 270],
    [100, 320, 180],
    [200, 320, 180],
  ];
  for (const [distance, width, height] of views) {
    it(`flags every pixel whose footprint reaches b_c to (1 + w) b_c, ${distance} M`, () => {
      const camera = {
        distance,
        azimuthDeg: 20,
        elevationDeg: 15,
        fovYDeg: autoFieldOfView(distance, M, 60),
      };
      const f = cameraFrame(camera, M);
      const e1: Vec3 = [
        f.position[0] / distance,
        f.position[1] / distance,
        f.position[2] / distance,
      ];
      const band = criticalBand(distance, M, f.tanHalfFovY, height);
      let needed = 0;
      let missed = 0;
      let flagged = 0;
      for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
          let below = false;
          let inside = false;
          let above = false;
          // 5 x 5 points across the pixel, corners included.
          for (let a = 0; a <= 4; a++) {
            for (let c = 0; c <= 4; c++) {
              const d = pixelDirection(f, width, height, i + a / 4, j + c / 4);
              const b = inwardImpactParameter(distance, e1, d);
              if (b === null) continue;
              if (b < BC) below = true;
              else if (b <= (1 + BAND_WIDTH) * BC) inside = true;
              else above = true;
            }
          }
          const centre = pixelDirection(f, width, height, i + 0.5, j + 0.5);
          const isFlagged = inCriticalBand(band, e1, centre);
          if (inside || (below && above)) {
            needed++;
            if (!isFlagged) missed++;
          }
          if (isFlagged) flagged++;
        }
      }
      expect(needed).toBeGreaterThan(0);
      expect(missed).toBe(0);
      // Conservative, but not wastefully so: the margin is one pixel half-diagonal on each side.
      expect(flagged).toBeLessThan(3 * needed);
    });
  }

  it('lies between the shadow edge and the outer impact parameter', () => {
    const f = cameraFrame({ distance: 30, azimuthDeg: 0, elevationDeg: 0, fovYDeg: 60 }, M);
    const band = criticalBand(30, M, f.tanHalfFovY, 1080);
    expect(band.cosMin).toBeLessThan(band.cosMax);
    expect(band.cosMax).toBeLessThan(1);
    expect(band.cosMin).toBeGreaterThan(0);
  });
});

describe('perceived value for the contrast test', () => {
  it('is the sRGB-encoded, tone-mapped luminance', () => {
    expect(perceivedValue([0, 0, 0], 1, true)).toBe(0);
    const grey = perceivedValue([0.5, 0.5, 0.5], 1, true);
    expect(grey).toBeCloseTo(srgbEncode(toneMap(0.5, 1)), 6);
    expect(perceivedValue([2, 2, 2], 1, false)).toBeCloseTo(1, 6);
  });

  it('a step of the threshold is a few 8-bit levels, visible but not noise', () => {
    expect(AA_THRESHOLD * 255).toBeGreaterThan(4);
    expect(AA_THRESHOLD * 255).toBeLessThan(40);
  });
});
