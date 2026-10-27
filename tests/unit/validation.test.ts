// The Validation panel's arithmetic (Stage 4; spec section 4 shadow target): measured against
// analytic angular radius, relative error and the tolerance of 1 px or 0.5 %, whichever is
// larger, in pixels of the validation render.
import { describe, expect, it } from 'vitest';
import { renderImage } from '../../src/cpu-renderer/render.ts';
import { validationScene } from '../../src/cpu-renderer/scenes.ts';
import { measureShadowRadius } from '../../src/cpu-renderer/shadow.ts';
import type { ValidationCounts } from '../../src/gpu/host/shadow-count.ts';
import { autoFieldOfView, shadowAngularRadius } from '../../src/physics/index.ts';
import { announcement, resultRows, shadowResult, toleranceText } from '../../src/ui/validation.ts';

const SIDE = 1024;

function counts(black: number, patch: Partial<ValidationCounts> = {}): ValidationCounts {
  return {
    colour: { black, white: SIDE * SIDE - black, other: 0, touchesBorder: false },
    termination: { escaped: SIDE * SIDE - black, captured: black, stepLimit: 0, other: 0 },
    blackNotCapturedOrStepLimit: 0,
    whiteCapturedOrStepLimit: 0,
    capturedOutside: 0,
    notCapturedInside: 0,
    maxDisagreementPx: 0,
    worstMismatchBand: 0,
    worstDisagreementBand: 0,
    ...patch,
  };
}

/** Field of view (degrees) that puts the analytic shadow radius at `px` pixels of the render. */
function fovFor(distance: number, px: number): number {
  const tanPsi = Math.tan(shadowAngularRadius(distance, 1));
  return (2 * Math.atan((tanPsi * SIDE) / (2 * px)) * 180) / Math.PI;
}

describe('shadow result', () => {
  it.each([5, 30, 200])('an exact cone of pixels at %d M is within the quantisation floor', (r) => {
    const fovYDeg = autoFieldOfView(r, 1, 60);
    const t = Math.tan((fovYDeg * Math.PI) / 360);
    const tanPsi = Math.tan(shadowAngularRadius(r, 1));
    let black = 0;
    for (let j = 0; j < SIDE; j++) {
      const sy = (1 - (2 * (j + 0.5)) / SIDE) * t;
      for (let i = 0; i < SIDE; i++) {
        const sx = ((2 * (i + 0.5)) / SIDE - 1) * t;
        if (sx * sx + sy * sy < tanPsi * tanPsi) black++;
      }
    }
    const res = shadowResult({ distance: r, fovYDeg, side: SIDE, counts: counts(black) });
    expect(Math.abs(res.diffPx)).toBeLessThanOrEqual(0.05);
    expect(res.pass).toBe(true);
    expect(res.analyticRad).toBe(shadowAngularRadius(r, 1));
  });

  it('tolerance is 1 px up to an analytic radius of 200 px, then 0.5 %', () => {
    for (const [px, tol] of [
      [100, 1],
      [199, 1],
      [200, 1],
      [300, 1.5],
      [400, 2],
    ] as const) {
      const res = shadowResult({
        distance: 30,
        fovYDeg: fovFor(30, px),
        side: SIDE,
        counts: counts(1000),
      });
      expect(res.analyticPx).toBeCloseTo(px, 9);
      expect(res.tolerancePx).toBeCloseTo(tol, 9);
    }
  });

  it('passes just inside the tolerance and fails just outside', () => {
    for (const px of [150, 300]) {
      const fovYDeg = fovFor(30, px);
      const tol = Math.max(1, 0.005 * px);
      const at = (r: number) =>
        shadowResult({
          distance: 30,
          fovYDeg,
          side: SIDE,
          counts: counts(Math.round(Math.PI * r * r)),
        });
      expect(at(px + tol - 0.05).pass).toBe(true);
      expect(at(px - tol + 0.05).pass).toBe(true);
      expect(at(px + tol + 0.05).pass).toBe(false);
      expect(at(px - tol - 0.05).pass).toBe(false);
    }
  });

  it('step-limit pixels, unexpected colours and border contact each fail the check', () => {
    const fovYDeg = fovFor(30, 150);
    const good = counts(Math.round(Math.PI * 150 * 150));
    const run = (c: ValidationCounts) =>
      shadowResult({ distance: 30, fovYDeg, side: SIDE, counts: c });
    expect(run(good).pass).toBe(true);
    const step = run({ ...good, termination: { ...good.termination, stepLimit: 1 } });
    expect(step.pass).toBe(false);
    expect(step.reasons.join(' ')).toMatch(/step limit/i);
    expect(run({ ...good, colour: { ...good.colour, other: 1 } }).pass).toBe(false);
    expect(run({ ...good, termination: { ...good.termination, other: 2 } }).pass).toBe(false);
    const border = run({ ...good, colour: { ...good.colour, touchesBorder: true } });
    expect(border.pass).toBe(false);
    expect(border.reasons.join(' ')).toMatch(/border/i);
  });

  it('reproduces the CPU measurement on a square CPU validation render', () => {
    const s = validationScene(30, 128, 128);
    const out = renderImage(s);
    const m = measureShadowRadius(out, s);
    let black = 0;
    for (let p = 0; p < 128 * 128; p++) {
      if (out.linear[3 * p] === 0 && out.linear[3 * p + 1] === 0 && out.linear[3 * p + 2] === 0)
        black++;
    }
    const side = 128;
    const res = shadowResult({
      distance: 30,
      fovYDeg: s.camera.fovYDeg,
      side,
      counts: {
        ...counts(black),
        colour: { black, white: side * side - black, other: 0, touchesBorder: false },
        termination: { escaped: side * side - black, captured: black, stepLimit: 0, other: 0 },
      },
    });
    expect(res.measuredPx).toBe(m.radiusPx);
    expect(Math.abs(res.measuredRad - m.angularRadius)).toBeLessThan(1e-15);
  });
});

describe('panel text', () => {
  it('labels pixel figures as pixels of the validation render, and never shows NaN or Infinity', () => {
    for (const black of [0, 1, 70_000, SIDE * SIDE]) {
      const res = shadowResult({ distance: 30, fovYDeg: 60, side: SIDE, counts: counts(black) });
      const text = [
        ...resultRows(res).flatMap((r) => [r.label, r.value]),
        announcement(res),
        toleranceText(res),
      ].join('\n');
      expect(text).not.toMatch(/NaN|Infinity|undefined/);
    }
    const res = shadowResult({ distance: 30, fovYDeg: 60, side: SIDE, counts: counts(70_000) });
    expect(toleranceText(res)).toContain('1024 render');
    expect(resultRows(res).map((r) => r.label)).toEqual([
      'Observer distance',
      'Field of view',
      'Analytic angular radius',
      'Measured angular radius',
      'Difference',
      'Tolerance',
      'Result',
      'Step-limit pixels',
      'Largest disagreement with the analytic edge',
    ]);
  });

  it('writes negative numbers with a true minus sign', () => {
    const fovYDeg = fovFor(30, 150);
    const res = shadowResult({
      distance: 30,
      fovYDeg,
      side: SIDE,
      counts: counts(Math.round(Math.PI * 149 * 149)),
    });
    const diff = resultRows(res).find((r) => r.label === 'Difference')!.value;
    expect(diff).toContain('−');
    expect(diff).not.toMatch(/(^|\s)-\d/);
  });

  it('announces one sentence with both angles and the verdict', () => {
    const fovYDeg = fovFor(30, 150);
    const res = shadowResult({
      distance: 30,
      fovYDeg,
      side: SIDE,
      counts: counts(Math.round(Math.PI * 150 * 150)),
    });
    expect(announcement(res)).toMatch(
      /^Shadow at 30\.0 M: measured \d+\.\d{3} degrees, analytic 9\.633 degrees, within tolerance\.$/,
    );
  });
});
