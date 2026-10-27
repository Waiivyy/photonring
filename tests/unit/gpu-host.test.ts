// Pure host-side logic of the WebGPU renderer (spec section 10, item 14 in part).
import { describe, expect, it } from 'vitest';
import { chooseInternalResolution } from '../../src/gpu/host/resolution.ts';
import { TileScheduler, planTiles } from '../../src/gpu/host/tiles.ts';
import {
  layoutStruct,
  packStruct,
  wgslStruct,
  type StructField,
} from '../../src/gpu/host/layout.ts';
import { halfToFloat } from '../../src/gpu/host/half.ts';
import { wgslHeader } from '../../src/gpu/host/wgsl.ts';
import { BLACKBODY_LUT, buildBlackbodyLut, lutColour } from '../../src/gpu/host/lut.ts';
import { blackbodyColour, luminance } from '../../src/physics/index.ts';

describe('internal resolution', () => {
  const limits = { maxTextureDimension2D: 8192, maxPixels: 3840 * 2160 };

  it('is the CSS size times the device pixel ratio when nothing limits it', () => {
    expect(
      chooseInternalResolution({
        cssWidth: 800,
        cssHeight: 450,
        devicePixelRatio: 2,
        scale: 1,
        ...limits,
      }),
    ).toEqual({
      width: 1600,
      height: 900,
      limitedBy: 'none',
    });
  });

  it('applies the quality scale', () => {
    const r = chooseInternalResolution({
      cssWidth: 800,
      cssHeight: 450,
      devicePixelRatio: 2,
      scale: 0.5,
      ...limits,
    });
    expect([r.width, r.height]).toEqual([800, 450]);
  });

  it('falls back to a smaller resolution when the texture limit is exceeded, keeping the aspect ratio', () => {
    const r = chooseInternalResolution({
      cssWidth: 2000,
      cssHeight: 1000,
      devicePixelRatio: 3,
      scale: 1,
      maxTextureDimension2D: 4096,
      maxPixels: Infinity,
    });
    expect(r.limitedBy).toBe('texture');
    expect(r.width).toBeLessThanOrEqual(4096);
    expect(r.height).toBeLessThanOrEqual(4096);
    expect(Math.abs(r.width / r.height - 2)).toBeLessThan(0.01);
  });

  it('caps the pixel count', () => {
    const r = chooseInternalResolution({
      cssWidth: 3840,
      cssHeight: 2160,
      devicePixelRatio: 2,
      scale: 1,
      ...limits,
    });
    expect(r.limitedBy).toBe('pixels');
    expect(r.width * r.height).toBeLessThanOrEqual(limits.maxPixels);
    expect(Math.abs(r.width / r.height - 16 / 9)).toBeLessThan(0.01);
  });

  it.each([
    [0, 450, 1],
    [800, -5, 1],
    [NaN, 450, 1],
    [800, 450, NaN],
    [800, 450, Infinity],
  ])('never returns less than 1 x 1 or a non-integer size (%d x %d, dpr %d)', (w, h, dpr) => {
    const r = chooseInternalResolution({
      cssWidth: w,
      cssHeight: h,
      devicePixelRatio: dpr,
      scale: 1,
      ...limits,
    });
    expect(Number.isInteger(r.width) && r.width >= 1).toBe(true);
    expect(Number.isInteger(r.height) && r.height >= 1).toBe(true);
    expect(r.width).toBeLessThanOrEqual(8192);
  });
});

describe('uniform struct layout (WGSL alignment rules)', () => {
  const fields: StructField[] = [
    ['a', 'vec3f'],
    ['b', 'f32'],
    ['c', 'u32'],
    ['d', 'vec3f'],
    ['e', 'vec2u'],
    ['f', 'f32'],
  ];

  it('places fields at their aligned offsets and rounds the size to 16', () => {
    const layout = layoutStruct(fields);
    // vec3f: align 16, size 12. f32/u32: align 4. vec2u: align 8, size 8.
    expect(layout.offsets).toEqual({ a: 0, b: 12, c: 16, d: 32, e: 48, f: 56 });
    expect(layout.size).toBe(64);
  });

  it('generates the matching WGSL struct', () => {
    expect(wgslStruct('P', fields)).toBe(
      'struct P {\n  a: vec3f,\n  b: f32,\n  c: u32,\n  d: vec3f,\n  e: vec2u,\n  f: f32,\n}\n',
    );
  });

  it('packs f32 and u32 values at those offsets', () => {
    const buf = packStruct(fields, {
      a: [1, 2, 3],
      b: 4.5,
      c: 7,
      d: [8, 9, 10],
      e: [11, 12],
      f: -1,
    });
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);
    expect([...f32.slice(0, 4)]).toEqual([1, 2, 3, 4.5]);
    expect(u32[4]).toBe(7);
    expect([...f32.slice(8, 11)]).toEqual([8, 9, 10]);
    expect([u32[12], u32[13]]).toEqual([11, 12]);
    expect(f32[14]).toBe(-1);
  });

  it('rejects missing or mistyped values', () => {
    expect(() => packStruct(fields, { a: [1, 2, 3] })).toThrow();
    expect(() => packStruct([['x', 'u32']], { x: -1 })).toThrow(RangeError);
    expect(() => packStruct([['x', 'vec3f']], { x: [1, 2] })).toThrow(RangeError);
  });
});

describe('tile schedule', () => {
  it('covers the image exactly once, centre first', () => {
    const tiles = planTiles(1000, 600, 256);
    const seen = new Uint8Array(1000 * 600);
    for (const t of tiles) {
      for (let y = t.y; y < t.y + t.height; y++) {
        for (let x = t.x; x < t.x + t.width; x++) seen[y * 1000 + x]! += 1;
      }
    }
    expect(seen.every((v) => v === 1)).toBe(true);
    const first = tiles[0]!;
    expect(first.x <= 500 && 500 < first.x + first.width).toBe(true);
    expect(first.y <= 300 && 300 < first.y + first.height).toBe(true);
  });

  it('dispatches at least one tile per frame and stays within the time budget otherwise', () => {
    const s = new TileScheduler();
    s.reset(planTiles(1024, 1024, 256)); // 16 tiles
    // Unknown cost: one tile, to measure.
    expect(s.takeForFrame(16)).toHaveLength(1);
    s.recordCost(65536, 4); // 4 ms for one 256 x 256 tile
    const batch = s.takeForFrame(16);
    expect(batch).toHaveLength(4);
    s.recordCost(1e9, 1e9); // absurdly slow
    expect(s.takeForFrame(16)).toHaveLength(1);
  });

  it('is done once every tile was taken, and reset starts over', () => {
    const s = new TileScheduler();
    s.reset(planTiles(256, 256, 256));
    expect(s.done).toBe(false);
    s.takeForFrame(16);
    expect(s.done).toBe(true);
    expect(s.takeForFrame(16)).toEqual([]);
    s.reset(planTiles(256, 256, 256));
    expect(s.done).toBe(false);
  });
});

describe('blackbody lookup table for the GPU', () => {
  it('matches the direct spectral integral within 0.3 % from 1000 K to 100000 K', () => {
    let worst = 0;
    for (let T = 1000; T <= 1e5; T *= 1.013) {
      const direct = blackbodyColour(T);
      const table = lutColour(BLACKBODY_LUT, T);
      const y = luminance(direct);
      for (let k = 0; k < 3; k++) {
        worst = Math.max(worst, Math.abs((table[k] as number) - (direct[k] as number)) / y);
      }
    }
    expect(worst).toBeLessThan(3e-3);
  });

  it('is zero below its range and grows linearly in T above it (Rayleigh-Jeans)', () => {
    expect(lutColour(BLACKBODY_LUT, 100)).toEqual([0, 0, 0]);
    const top = lutColour(BLACKBODY_LUT, 1e5);
    const above = lutColour(BLACKBODY_LUT, 2e5);
    for (let k = 0; k < 3; k++) expect(above[k]).toBeCloseTo(2 * (top[k] as number), 10);
  });

  it('stores luminance in the fourth channel', () => {
    const lut = buildBlackbodyLut();
    for (let i = 0; i < lut.size; i += 97) {
      const rgb: [number, number, number] = [
        lut.data[4 * i]!,
        lut.data[4 * i + 1]!,
        lut.data[4 * i + 2]!,
      ];
      expect(lut.data[4 * i + 3]).toBeCloseTo(luminance(rgb), 5);
    }
  });
});

describe('half-precision readback', () => {
  it('decodes binary16 values, including subnormals and specials', () => {
    expect(halfToFloat(0x0000)).toBe(0);
    expect(halfToFloat(0x3c00)).toBe(1);
    expect(halfToFloat(0x4880)).toBe(9);
    expect(halfToFloat(0xc000)).toBe(-2);
    expect(halfToFloat(0x7bff)).toBe(65504);
    expect(halfToFloat(0x0001)).toBe(2 ** -24);
    expect(halfToFloat(0x7c00)).toBe(Infinity);
    expect(halfToFloat(0x7e00)).toBeNaN();
  });
});

describe('generated WGSL constants', () => {
  it('the termination debug colours come from the shared TypeScript constant', () => {
    const header = wgslHeader({ size: 2, tMin: 1000, tMax: 100000 });
    expect(header).toContain('const DEBUG_ESCAPED: vec3f = vec3f(0.15, 0.3, 0.8);');
    expect(header).toContain('const DEBUG_CAPTURED: vec3f = vec3f(0.0, 0.0, 0.0);');
    expect(header).toContain('const DEBUG_STEP_LIMIT: vec3f = vec3f(1.0, 0.0, 1.0);');
  });
});
