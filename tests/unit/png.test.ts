// Minimal PNG writer and reader for golden images (8-bit RGB only).
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../../src/cpu-renderer/png.ts';

function testImage(width: number, height: number): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 37 + (i >> 5)) & 255;
  return rgb;
}

describe('PNG', () => {
  it('round-trips pixels exactly', () => {
    const rgb = testImage(17, 9);
    const decoded = decodePng(encodePng(17, 9, rgb));
    expect(decoded.width).toBe(17);
    expect(decoded.height).toBe(9);
    expect(decoded.rgb).toEqual(rgb);
  });

  it('writes the PNG signature and an RGB IHDR', () => {
    const png = encodePng(3, 2, testImage(3, 2));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.subarray(12, 16).toString('latin1')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(3);
    expect(png.readUInt32BE(20)).toBe(2);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(2); // colour type: RGB
  });

  it('is deterministic', () => {
    const rgb = testImage(40, 30);
    expect(encodePng(40, 30, rgb).equals(encodePng(40, 30, rgb))).toBe(true);
  });

  it('detects corruption through the chunk CRC', () => {
    const png = Buffer.from(encodePng(8, 8, testImage(8, 8)));
    png[40] = (png[40] as number) ^ 0xff;
    expect(() => decodePng(png)).toThrow();
  });

  it('rejects a buffer of the wrong size and non-PNG data', () => {
    expect(() => encodePng(4, 4, new Uint8Array(10))).toThrow(RangeError);
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow();
  });
});
