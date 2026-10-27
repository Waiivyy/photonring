// The general PNG reader used by the saved-image tests, checked against the repository's own
// encoder and against hand-built RGBA images using every filter type.
import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng } from '../../src/cpu-renderer/png.ts';
import { readPng } from '../helpers/png-read.ts';
import { seededRandom } from '../helpers/random.ts';

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** An RGBA PNG whose row y uses filter y % 5, split over two IDAT chunks. */
function rgbaPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const filter = y % 5;
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const x = rgba[y * stride + i]!;
      const a = i >= 4 ? rgba[y * stride + i - 4]! : 0;
      const b = y > 0 ? rgba[(y - 1) * stride + i]! : 0;
      const c = i >= 4 && y > 0 ? rgba[(y - 1) * stride + i - 4]! : 0;
      const p = a + b - c;
      const pred = [
        0,
        a,
        b,
        (a + b) >> 1,
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c,
      ][filter]!;
      raw[y * (stride + 1) + 1 + i] = (x - pred) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const z = deflateSync(raw);
  const half = Math.floor(z.length / 2);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', z.subarray(0, half)),
    chunk('IDAT', z.subarray(half)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('PNG reader', () => {
  it('reads the repository encoder output (RGB) exactly', () => {
    const rand = seededRandom(3);
    const rgb = Uint8Array.from({ length: 17 * 9 * 3 }, () => Math.floor(rand() * 256));
    const img = readPng(encodePng(17, 9, rgb));
    expect([img.width, img.height]).toEqual([17, 9]);
    for (let p = 0; p < 17 * 9; p++) {
      expect([...img.rgba.subarray(4 * p, 4 * p + 4)]).toEqual([
        rgb[3 * p],
        rgb[3 * p + 1],
        rgb[3 * p + 2],
        255,
      ]);
    }
  });

  it('reads RGBA with all five filter types and several IDAT chunks', () => {
    const rand = seededRandom(4);
    const rgba = Uint8Array.from({ length: 13 * 11 * 4 }, () => Math.floor(rand() * 256));
    const img = readPng(rgbaPng(13, 11, rgba));
    expect([img.width, img.height]).toEqual([13, 11]);
    expect([...img.rgba]).toEqual([...rgba]);
  });

  it('rejects what it does not support', () => {
    expect(() => readPng(Buffer.from('not a png'))).toThrow();
  });
});
