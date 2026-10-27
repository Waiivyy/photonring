// A general PNG reader for the browser's own PNGs (saved images): 8-bit RGB or RGBA,
// non-interlaced, any filter per row, any number of IDAT chunks. The strict decodePng in
// src/cpu-renderer/png.ts reads only the goldens' own format.
import { inflateSync } from 'node:zlib';

export interface PngImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major (alpha 255 for RGB images). */
  readonly rgba: Uint8Array;
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function readPng(png: Buffer): PngImage {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const colour = data[9];
      if (depth !== 8 || (colour !== 2 && colour !== 6) || data[12] !== 0) {
        throw new Error(
          `unsupported PNG: depth ${depth}, colour type ${colour}, interlace ${data[12]}`,
        );
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i]!;
      const a = i >= channels ? out[row + i - channels]! : 0;
      const b = y > 0 ? out[row - stride + i]! : 0;
      const c = i >= channels && y > 0 ? out[row - stride + i - channels]! : 0;
      let v: number;
      switch (filter) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`bad PNG filter ${filter}`);
      }
      out[row + i] = v & 255;
    }
  }
  if (channels === 4) return { width, height, rgba: out };
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    rgba.set(out.subarray(3 * p, 3 * p + 3), 4 * p);
    rgba[4 * p + 3] = 255;
  }
  return { width, height, rgba };
}
