// The photon subring strip (docs/PHYSICS.md, section 6b): the region just outside the shadow edge,
// unrolled and magnified, with the image angle across and log10(b/b_c - 1) down. Checks the maps
// and that the CPU render puts each band where the 64-bit library predicts it.
import { describe, expect, it } from 'vitest';
import { renderImage, type RenderSettings } from '../../src/cpu-renderer/render.ts';
import { DEFAULT_DISK } from '../../src/cpu-renderer/scenes.ts';
import {
  cameraFrame,
  criticalImpactParameter,
  firstPlaneCrossingAngle,
  STRIP_BOTTOM_LOG10,
  stripColumnAngle,
  stripDirection,
  stripRange,
  stripRowFromOffset,
  stripRowOffset,
  subringOffset,
  traceRay,
  type CameraParams,
  type Vec3,
} from '../../src/physics/index.ts';
import { measured } from '../helpers/measured.ts';

const M = 1;
const BC = criticalImpactParameter(M);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('strip maps', () => {
  it('runs from 10^0.5 (or the largest visible offset) down to 10^-6.5', () => {
    expect(STRIP_BOTTOM_LOG10).toBe(-6.5);
    expect(stripRange(200)).toEqual({ top: 0.5, bottom: -6.5 });
    for (const rObs of [5, 10, 20]) {
      const k = Math.sqrt(1 - 2 / rObs) / rObs;
      const top = Math.log10(1 / (k * BC) - 1);
      expect(stripRange(rObs).top).toBeCloseTo(Math.min(0.5, top), 12);
    }
    expect(stripRange(5).top).toBeCloseTo(-0.616, 3);
  });

  it('maps rows to offsets and back, row centres evenly spaced in log10', () => {
    const range = stripRange(30);
    const H = 700;
    for (const j of [0, 1, 349, 699]) {
      const eps = stripRowOffset(j, H, range);
      expect(stripRowFromOffset(eps, H, range)).toBeCloseTo(j + 0.5, 9);
    }
    const step = Math.log10(stripRowOffset(0, H, range)) - Math.log10(stripRowOffset(1, H, range));
    expect(step).toBeCloseTo((range.top - range.bottom) / H, 12);
  });

  it('columns run once round the image, from image right towards image up', () => {
    expect(stripColumnAngle(0, 360)).toBeCloseTo((0.5 * Math.PI) / 180, 12);
    expect(stripColumnAngle(89.5, 360)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('a direction makes the angle alpha with the line of sight, sin(alpha) = k b_c (1 + eps)', () => {
    const camera: CameraParams = { distance: 30, azimuthDeg: 40, elevationDeg: 12, fovYDeg: 60 };
    const f = cameraFrame(camera, M);
    const k = Math.sqrt(1 - 2 / 30) / 30;
    for (const [eps, theta] of [
      [1e-3, 0],
      [0.2, Math.PI / 2],
      [1e-6, 4],
    ] as const) {
      const d = stripDirection(f, 30, eps, theta, M);
      expect(Math.hypot(...d)).toBeCloseTo(1, 14);
      expect(Math.sqrt(1 - dot(d, f.forward) ** 2)).toBeCloseTo(k * BC * (1 + eps), 14);
    }
    const up = stripDirection(f, 30, 0.1, Math.PI / 2, M);
    expect(dot(up, f.up)).toBeGreaterThan(0);
    expect(Math.abs(dot(up, f.right))).toBeLessThan(1e-12);
  });
});

function stripSettings(camera: CameraParams, width: number, height: number): RenderSettings {
  return {
    width,
    height,
    M,
    camera,
    disk: DEFAULT_DISK,
    sky: 'black',
    mode: 'subrings',
    samplesPerAxis: 1,
    dphi: 0.0125,
    maxSteps: 8000,
    exposure: 1,
    toneMapping: true,
  };
}

describe('subring strip on the CPU', () => {
  it('face-on at 30 M: every band edge of orders 1 to 4 lies within 1 row of the 64-bit prediction', () => {
    const camera: CameraParams = { distance: 30, azimuthDeg: 0, elevationDeg: 90, fovYDeg: 60 };
    const W = 4;
    const H = 600;
    const out = renderImage(stripSettings(camera, W, H));
    expect(out.order).toBeDefined();
    const range = stripRange(30);
    let worst = 0;
    for (let i = 0; i < W; i++) {
      const col = Array.from({ length: H }, (_, j) => out.order![j * W + i]!);
      for (let n = 1; n <= 4; n++) {
        for (const R of [DEFAULT_DISK.rIn, DEFAULT_DISK.rOut]) {
          const edge = stripRowFromOffset(subringOffset(30, R, n, Math.PI / 2, M), H, range);
          // Where the order changes from n to another value, nearest that edge.
          let best = Infinity;
          for (let j = 1; j < H; j++) {
            if ((col[j - 1] === n) !== (col[j] === n)) best = Math.min(best, Math.abs(j - edge));
          }
          worst = Math.max(worst, best);
        }
      }
    }
    expect(
      measured('subring strip on the CPU: band edge against the f64 edge, rows', worst),
    ).toBeLessThanOrEqual(1);
  }, 60_000);

  it('in the default view, the band edges of orders 1 to 3 sit at the predicted rows where the disk does not hide them', () => {
    const camera: CameraParams = { distance: 30, azimuthDeg: 0, elevationDeg: 12, fovYDeg: 60 };
    const W = 24;
    const H = 500;
    const out = renderImage(stripSettings(camera, W, H));
    const f = cameraFrame(camera, M);
    const range = stripRange(30);
    let checked = 0;
    let worst = 0;
    for (let i = 0; i < W; i++) {
      const theta = stripColumnAngle(i, W);
      const e2: Vec3 = [
        Math.cos(theta) * f.right[0] + Math.sin(theta) * f.up[0],
        Math.cos(theta) * f.right[1] + Math.sin(theta) * f.up[1],
        Math.cos(theta) * f.right[2] + Math.sin(theta) * f.up[2],
      ];
      const phi0 = firstPlaneCrossingAngle(f.position[2] / 30, e2[2])!;
      const col = Array.from({ length: H }, (_, j) => out.order![j * W + i]!);
      for (let n = 1; n <= 3; n++) {
        for (const [R, inside] of [
          [DEFAULT_DISK.rIn, 1.02],
          [DEFAULT_DISK.rOut, 0.98],
        ] as const) {
          // An edge is seen only if a ray just inside the band meets the disk first at crossing
          // n: elsewhere the near side of the disk (order 0) covers it.
          const edge = subringOffset(30, R, n, phi0, M);
          const ray = traceRay(M, f.position, stripDirection(f, 30, edge * inside, theta, M), {
            dphi: 0.0125,
            maxSteps: 8000,
          });
          const first = ray.crossings.findIndex(
            (c) => c.radius >= DEFAULT_DISK.rIn && c.radius <= DEFAULT_DISK.rOut,
          );
          if (first !== n) continue;
          checked++;
          const predicted = stripRowFromOffset(edge, H, range);
          let best = Infinity;
          for (let j = 1; j < H; j++) {
            if ((col[j - 1] === n) !== (col[j] === n))
              best = Math.min(best, Math.abs(j - predicted));
          }
          worst = Math.max(worst, best);
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(worst).toBeLessThanOrEqual(1);
  }, 60_000);
});
