// Procedural star field: deterministic, integer-hash based, seamless, shared by CPU and GPU.
import { describe, expect, it } from 'vitest';
import {
  STAR_LAYERS,
  luminance,
  pcg3d,
  starAt,
  skyRadiance,
  unitFromU32,
  type Vec3,
} from '../../src/physics/index.ts';
import { randomUnitVector, seededRandom } from '../helpers/random.ts';

/** Independent pcg3d with BigInt arithmetic modulo 2^32 (Jarzynski and Olano 2020, sec. 6.1). */
function pcg3dBig(x: number, y: number, z: number): [number, number, number] {
  const m = 0xffffffffn;
  let a = BigInt(x >>> 0);
  let b = BigInt(y >>> 0);
  let c = BigInt(z >>> 0);
  a = (a * 1664525n + 1013904223n) & m;
  b = (b * 1664525n + 1013904223n) & m;
  c = (c * 1664525n + 1013904223n) & m;
  a = (a + b * c) & m;
  b = (b + c * a) & m;
  c = (c + a * b) & m;
  a ^= a >> 16n;
  b ^= b >> 16n;
  c ^= c >> 16n;
  a = (a + b * c) & m;
  b = (b + c * a) & m;
  c = (c + a * b) & m;
  return [Number(a), Number(b), Number(c)];
}

describe('pcg3d hash', () => {
  it('matches an independent BigInt implementation, including negative cell indices', () => {
    for (const [x, y, z] of [
      [0, 0, 0],
      [1, 2, 3],
      [-1, -7, 123456],
      [0x7fffffff, -0x80000000, 42],
      [2147483647, 99, -2],
    ] as const) {
      expect(pcg3d(x, y, z)).toEqual(pcg3dBig(x, y, z));
    }
  });

  it('converts to [0, 1) values that are exact in f32', () => {
    for (const u of [0, 1, 255, 256, 0xffffffff, 0x80000000]) {
      const v = unitFromU32(u);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Math.fround(v)).toBe(v);
    }
  });
});

describe('star field', () => {
  it('is deterministic, finite and non-negative', () => {
    const rand = seededRandom(3);
    for (let i = 0; i < 2000; i++) {
      const d = randomUnitVector(rand);
      const a = skyRadiance(d, 1);
      expect(skyRadiance(d, 1)).toEqual(a);
      for (const c of a) {
        expect(Number.isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('has no seams: radiance is continuous across lattice cell boundaries', () => {
    const rand = seededRandom(4);
    let lit = 0;
    for (let i = 0; i < 3000; i++) {
      // Put the direction exactly on a cell boundary of a random layer and axis, then nudge it.
      const layer = STAR_LAYERS[i % STAR_LAYERS.length]!;
      const d = randomUnitVector(rand);
      const axis = i % 3;
      const target = Math.round((d[axis] as number) * layer.cellsPerUnit) / layer.cellsPerUnit;
      const before: Vec3 = [...d];
      const after: [number, number, number] = [...d];
      (before as number[])[axis] = target - 1e-13;
      after[axis] = target + 1e-13;
      const norm = (v: Vec3): Vec3 => {
        const n = Math.hypot(v[0], v[1], v[2]);
        return [v[0] / n, v[1] / n, v[2] / n];
      };
      const a = luminance(skyRadiance(norm(before), 1));
      const b = luminance(skyRadiance(norm(after), 1));
      expect(Math.abs(a - b)).toBeLessThan(1e-9 * Math.max(1, a));
      if (a > 0) lit++;
    }
    expect(lit).toBeGreaterThan(0);
  });

  it('every star is visible at its own direction with its catalogue brightness', () => {
    let found = 0;
    for (const layer of STAR_LAYERS) {
      for (let cx = -3; cx <= 3; cx++) {
        for (let cy = -3; cy <= 3; cy++) {
          const star = starAt(layer, [layer.cellsPerUnit, cx, cy]);
          if (!star) continue;
          found++;
          expect(luminance(skyRadiance(star.direction, 1))).toBeGreaterThanOrEqual(
            star.luminance * (1 - 1e-12),
          );
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('a static observer deeper in the potential sees each star bluer and brighter', () => {
    const layer = STAR_LAYERS[0]!;
    let checked = 0;
    for (let cy = -20; cy <= 20 && checked < 5; cy++) {
      const star = starAt(layer, [layer.cellsPerUnit, cy, 3]);
      if (!star) continue;
      const near = skyRadiance(star.direction, 1.2);
      const far = skyRadiance(star.direction, 1);
      expect(luminance(near)).toBeGreaterThan(luminance(far));
      expect(near[2] / near[0]).toBeGreaterThan(far[2] / far[0]);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('star density is the same toward all six axis directions within 25 %', () => {
    // Count distinct stars of the middle layer in a cap of 0.25 rad around each axis.
    const layer = STAR_LAYERS[1]!;
    const k = layer.cellsPerUnit;
    const counts: number[] = [];
    for (const axis of [0, 1, 2]) {
      for (const sign of [1, -1]) {
        let n = 0;
        const span = Math.ceil(0.3 * k);
        for (let a = -span; a <= span; a++) {
          for (let b = -span; b <= span; b++) {
            for (let r = k - 2; r <= k + 2; r++) {
              const cell = [0, 0, 0];
              cell[axis] = sign > 0 ? r : -r - 1;
              cell[(axis + 1) % 3] = a;
              cell[(axis + 2) % 3] = b;
              const star = starAt(layer, cell as [number, number, number]);
              if (star && sign * (star.direction[axis] as number) > Math.cos(0.25)) n++;
            }
          }
        }
        counts.push(n);
      }
    }
    const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
    expect(mean).toBeGreaterThan(50);
    for (const c of counts) expect(Math.abs(c / mean - 1)).toBeLessThan(0.25);
  });
});
