// Classifies the two offscreen validation renders read back for the Validation panel: the colour
// render (disk off, uniform sky of exactly 1.0, no tone mapping) and the termination render of the
// same rays. Pure: works on the raw rgba16float halves, with each row padded to bytesPerRow.
import { TERMINATION_COLOURS } from '../../physics/index.ts';
import { halfToFloat } from './half.ts';

export interface ShadowReadback {
  readonly side: number;
  readonly bytesPerRow: number;
  /** The colour render, then the termination render, each side rows of bytesPerRow bytes. */
  readonly halves: Uint16Array;
}

export interface ValidationCounts {
  readonly colour: {
    /** All three channels +0 or -0: captured or step-limit rays. */
    readonly black: number;
    /** All three channels exactly 1.0: escaped rays. */
    readonly white: number;
    /** Anything else, which should never occur. */
    readonly other: number;
    readonly touchesBorder: boolean;
  };
  readonly termination: {
    readonly escaped: number;
    readonly captured: number;
    readonly stepLimit: number;
    readonly other: number;
  };
  /** Black colour pixels whose ray the termination render neither captured nor ran out of steps. */
  readonly blackNotCapturedOrStepLimit: number;
  /** Captured pixels whose centre lies outside the analytic shadow edge, and escaped ones inside. */
  readonly capturedOutside: number;
  readonly notCapturedInside: number;
  /** Largest distance from the analytic edge of a disagreeing pixel centre, in pixels. */
  readonly maxDisagreementPx: number;
  /** Largest |b/b_c - 1| of a mismatched pixel, and of a pixel disagreeing with the edge (0: none). */
  readonly worstMismatchBand: number;
  readonly worstDisagreementBand: number;
}

const ONE = 0x3c00;
const COLOUR_TOLERANCE = 1e-3;

let halfTable: Float32Array | null = null;
/** Every binary16 value decoded once (256 KB), so the per-pixel work is a lookup. */
function halfValues(): Float32Array {
  if (!halfTable) {
    halfTable = new Float32Array(65536);
    for (let h = 0; h < 65536; h++) halfTable[h] = halfToFloat(h);
  }
  return halfTable;
}

const near = (x: number, c: number) => Math.abs(x - c) <= COLOUR_TOLERANCE;

/**
 * Counts the readback. `tanHalfFovY` is the render's, `tanPsi` the tangent of the analytic shadow
 * radius; pixel centres are compared with the edge in the tan plane (rho^2 against tan^2 psi),
 * which catches errors that cancel in the area. The band |b/b_c - 1| of a pixel follows from its
 * angle alpha to the optical axis: b / b_c = sin(alpha) / sin(psi).
 */
export function classifyValidation(
  r: ShadowReadback,
  view: { readonly tanHalfFovY: number; readonly tanPsi: number },
): ValidationCounts {
  const { side, bytesPerRow, halves } = r;
  const rowHalves = bytesPerRow / 2;
  if (!(Number.isInteger(side) && side > 0 && rowHalves >= side * 4)) {
    throw new RangeError('validation readback has an invalid size');
  }
  if (halves.length < 2 * rowHalves * side) throw new RangeError('validation readback too short');
  const t = view.tanHalfFovY;
  const tanPsi2 = view.tanPsi * view.tanPsi;
  const sinPsi = view.tanPsi / Math.hypot(1, view.tanPsi);
  const pxPerTan = side / (2 * t);
  const band = (rho: number) => Math.abs(rho / Math.hypot(1, rho) / sinPsi - 1);

  let black = 0;
  let white = 0;
  let other = 0;
  let touchesBorder = false;
  let escaped = 0;
  let captured = 0;
  let stepLimit = 0;
  let termOther = 0;
  let mismatched = 0;
  let capturedOutside = 0;
  let notCapturedInside = 0;
  let maxDisagreementPx = 0;
  let worstMismatchBand = 0;
  let worstDisagreementBand = 0;
  const termBase = rowHalves * side;
  const table = halfValues();
  const [cr, cg, cb] = TERMINATION_COLOURS.captured;
  const [er, eg, eb] = TERMINATION_COLOURS.escaped;
  const [sr, sg, sb] = TERMINATION_COLOURS.stepLimit;

  for (let j = 0; j < side; j++) {
    const sy = (1 - (2 * (j + 0.5)) / side) * t;
    for (let i = 0; i < side; i++) {
      const c = j * rowHalves + i * 4;
      const r0 = halves[c] as number;
      const g0 = halves[c + 1] as number;
      const b0 = halves[c + 2] as number;
      const isBlack = ((r0 | g0 | b0) & 0x7fff) === 0;
      if (isBlack) {
        black++;
        if (i === 0 || j === 0 || i === side - 1 || j === side - 1) touchesBorder = true;
      } else if (r0 === ONE && g0 === ONE && b0 === ONE) white++;
      else other++;

      const k = termBase + c;
      const tr = table[halves[k] as number] as number;
      const tg = table[halves[k + 1] as number] as number;
      const tb = table[halves[k + 2] as number] as number;
      let isCaptured = false;
      let isEscaped = false;
      if (near(tr, cr) && near(tg, cg) && near(tb, cb)) {
        captured++;
        isCaptured = true;
      } else if (near(tr, er) && near(tg, eg) && near(tb, eb)) {
        escaped++;
        isEscaped = true;
      } else if (near(tr, sr) && near(tg, sg) && near(tb, sb)) stepLimit++;
      else termOther++;

      const sx = ((2 * (i + 0.5)) / side - 1) * t;
      const rho2 = sx * sx + sy * sy;
      if (isBlack && isEscaped) {
        mismatched++;
        worstMismatchBand = Math.max(worstMismatchBand, band(Math.sqrt(rho2)));
      }
      const outside = rho2 > tanPsi2;
      if ((isCaptured && outside) || (isEscaped && !outside && rho2 < tanPsi2)) {
        if (isCaptured) capturedOutside++;
        else notCapturedInside++;
        const rho = Math.sqrt(rho2);
        maxDisagreementPx = Math.max(maxDisagreementPx, Math.abs(rho - view.tanPsi) * pxPerTan);
        worstDisagreementBand = Math.max(worstDisagreementBand, band(rho));
      }
    }
  }
  return {
    colour: { black, white, other, touchesBorder },
    termination: { escaped, captured, stepLimit, other: termOther },
    blackNotCapturedOrStepLimit: mismatched,
    capturedOutside,
    notCapturedInside,
    maxDisagreementPx,
    worstMismatchBand,
    worstDisagreementBand,
  };
}
