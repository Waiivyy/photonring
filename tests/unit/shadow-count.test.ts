// Classification of the offscreen validation renders read back from the GPU (Stage 4): the
// colour render (disk off, uniform white sky) and the termination render of the same rays.
import { describe, expect, it } from 'vitest';
import { classifyValidation, type ShadowReadback } from '../../src/gpu/host/shadow-count.ts';
import { halfToFloat } from '../../src/gpu/host/half.ts';
import { TERMINATION_COLOURS, type Vec3 } from '../../src/physics/index.ts';
import { floatToHalf } from '../helpers/half.ts';

type Px = { colour: Vec3 | 'negzero'; termination: Vec3 };
const WHITE: Vec3 = [1, 1, 1];
const BLACK: Vec3 = [0, 0, 0];

/** Builds the two padded rgba16float images of a side x side render. */
function readback(
  side: number,
  pixel: (i: number, j: number) => Px,
  padHalves = 64,
): ShadowReadback {
  const rowHalves = side * 4 + padHalves;
  const bytesPerRow = rowHalves * 2;
  const halves = new Uint16Array(rowHalves * side * 2).fill(0x7e00); // NaN in the padding
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const p = pixel(i, j);
      const c = j * rowHalves + i * 4;
      const t = rowHalves * side + c;
      const colour = p.colour === 'negzero' ? [-0, -0, -0] : p.colour;
      colour.forEach((v, k) => (halves[c + k] = floatToHalf(v)));
      halves[c + 3] = 0x3c00;
      p.termination.forEach((v, k) => (halves[t + k] = floatToHalf(v)));
      halves[t + 3] = 0x3c00;
    }
  }
  return { side, bytesPerRow, halves };
}

const T = 0.5;
const TAN_PSI = 0.2;
const SIDE = 64;
/** Tan-plane radius of a pixel centre in a square image. */
const rho = (i: number, j: number) => {
  const sx = ((2 * (i + 0.5)) / SIDE - 1) * T;
  const sy = (1 - (2 * (j + 0.5)) / SIDE) * T;
  return Math.hypot(sx, sy);
};
const cone = (i: number, j: number): Px =>
  rho(i, j) < TAN_PSI
    ? { colour: BLACK, termination: TERMINATION_COLOURS.captured }
    : { colour: WHITE, termination: TERMINATION_COLOURS.escaped };
let inside = 0;
for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) if (rho(i, j) < TAN_PSI) inside++;

describe('validation readback classification', () => {
  it('the half encoder used by these tests round-trips the values that matter', () => {
    for (const v of [0, 1, 0.15, 0.3, 0.8, 0.5]) {
      expect(Math.abs(halfToFloat(floatToHalf(v)) - v)).toBeLessThan(1e-3);
    }
    expect(floatToHalf(1)).toBe(0x3c00);
    expect(floatToHalf(-0)).toBe(0x8000);
  });

  it('counts an exact cone: black inside, white outside, all in agreement', () => {
    const c = classifyValidation(readback(SIDE, cone), { tanHalfFovY: T, tanPsi: TAN_PSI });
    expect(c.colour).toEqual({
      black: inside,
      white: SIDE * SIDE - inside,
      other: 0,
      touchesBorder: false,
    });
    expect(c.termination).toEqual({
      escaped: SIDE * SIDE - inside,
      captured: inside,
      stepLimit: 0,
      other: 0,
    });
    expect(c.blackNotCapturedOrStepLimit).toBe(0);
    expect(c.capturedOutside).toBe(0);
    expect(c.notCapturedInside).toBe(0);
    expect(c.maxDisagreementPx).toBe(0);
  });

  it('ignores the row padding and accepts negative zero as black', () => {
    const c = classifyValidation(
      readback(
        SIDE,
        (i, j) => (rho(i, j) < TAN_PSI ? { ...cone(i, j), colour: 'negzero' } : cone(i, j)),
        128,
      ),
      { tanHalfFovY: T, tanPsi: TAN_PSI },
    );
    expect(c.colour.black).toBe(inside);
    expect(c.colour.other).toBe(0);
  });

  it('flags black at the border, other colours, and step-limit pixels', () => {
    const c = classifyValidation(
      readback(SIDE, (i, j) => {
        if (i === 0 && j === 5) return { colour: BLACK, termination: TERMINATION_COLOURS.captured };
        if (i === 10 && j === 10) return { colour: [0.5, 0.5, 0.5], termination: [0.5, 0.5, 0.5] };
        if (i === SIDE / 2 && j === SIDE / 2)
          return { colour: BLACK, termination: TERMINATION_COLOURS.stepLimit };
        return cone(i, j);
      }),
      { tanHalfFovY: T, tanPsi: TAN_PSI },
    );
    expect(c.colour.touchesBorder).toBe(true);
    expect(c.colour.other).toBe(1);
    expect(c.termination.other).toBe(1);
    expect(c.termination.stepLimit).toBe(1);
  });

  it('finds disagreements with the analytic edge that would cancel in the area', () => {
    // One captured pixel outside the cone and one escaped pixel inside: the area is unchanged.
    const outsidePx: [number, number] = [SIDE / 2 + 9, SIDE / 2];
    const insidePx: [number, number] = [SIDE / 2, SIDE / 2 + 3];
    const c = classifyValidation(
      readback(SIDE, (i, j) => {
        if (i === outsidePx[0] && j === outsidePx[1])
          return { colour: BLACK, termination: TERMINATION_COLOURS.captured };
        if (i === insidePx[0] && j === insidePx[1])
          return { colour: WHITE, termination: TERMINATION_COLOURS.escaped };
        return cone(i, j);
      }),
      { tanHalfFovY: T, tanPsi: TAN_PSI },
    );
    expect(c.colour.black).toBe(inside);
    expect(c.capturedOutside).toBe(1);
    expect(c.notCapturedInside).toBe(1);
    const pxPerTan = SIDE / (2 * T);
    const expected = Math.max(
      (rho(...outsidePx) - TAN_PSI) * pxPerTan,
      (TAN_PSI - rho(...insidePx)) * pxPerTan,
    );
    expect(c.maxDisagreementPx).toBeCloseTo(expected, 12);
    expect(c.worstDisagreementBand).toBeGreaterThan(0);
  });

  it('reports black pixels the termination render did not capture', () => {
    const c = classifyValidation(
      readback(SIDE, (i, j) =>
        i === 1 && j === 1
          ? { colour: BLACK, termination: TERMINATION_COLOURS.escaped }
          : cone(i, j),
      ),
      { tanHalfFovY: T, tanPsi: TAN_PSI },
    );
    expect(c.blackNotCapturedOrStepLimit).toBe(1);
    expect(c.worstMismatchBand).toBeGreaterThan(0);
  });

  it('rejects a buffer of the wrong size', () => {
    const r = readback(8, cone);
    expect(() =>
      classifyValidation({ ...r, side: 9 }, { tanHalfFovY: T, tanPsi: TAN_PSI }),
    ).toThrow(RangeError);
  });
});
