// The Validation panel's arithmetic and text: the shadow measured on the offscreen validation
// render against the analytic angular radius, with the brief's tolerance (1 px of the render or
// 0.5 %, whichever is larger). Pure and DOM-free.
import type { ValidationCounts } from '../gpu/host/shadow-count.ts';
import {
  coneAngleFromImageRadius,
  imageRadiusFromConeAngle,
  shadowAngularRadius,
} from '../physics/index.ts';

export interface ShadowResult {
  readonly distance: number;
  readonly fovYDeg: number;
  readonly side: number;
  /** Equivalent radius of the black region, sqrt(black / pi), in pixels of the render. */
  readonly measuredPx: number;
  readonly measuredRad: number;
  readonly analyticRad: number;
  readonly analyticPx: number;
  readonly diffPx: number;
  /** (measured - analytic) / analytic, of the angular radius. */
  readonly relativeError: number;
  readonly tolerancePx: number;
  readonly pass: boolean;
  readonly reasons: readonly string[];
  readonly counts: ValidationCounts;
}

export function shadowResult(input: {
  readonly distance: number;
  readonly fovYDeg: number;
  readonly side: number;
  readonly counts: ValidationCounts;
}): ShadowResult {
  const { distance, fovYDeg, side, counts } = input;
  const t = Math.tan((fovYDeg * Math.PI) / 360);
  const measuredPx = Math.sqrt(counts.colour.black / Math.PI);
  const measuredRad = coneAngleFromImageRadius(measuredPx, side, t);
  const analyticRad = shadowAngularRadius(distance, 1);
  const analyticPx = imageRadiusFromConeAngle(analyticRad, side, t);
  const diffPx = measuredPx - analyticPx;
  const tolerancePx = Math.max(1, 0.005 * analyticPx);
  const reasons: string[] = [];
  if (!(Math.abs(diffPx) <= tolerancePx)) reasons.push('difference larger than the tolerance');
  if (counts.termination.stepLimit > 0) reasons.push('rays reached the step limit');
  if (counts.colour.other > 0 || counts.termination.other > 0) {
    reasons.push('pixels of unexpected colour');
  }
  if (counts.colour.touchesBorder) reasons.push('the shadow touches the border of the render');
  return {
    distance,
    fovYDeg,
    side,
    measuredPx,
    measuredRad,
    analyticRad,
    analyticPx,
    diffPx,
    relativeError: (measuredRad - analyticRad) / analyticRad,
    tolerancePx,
    pass: reasons.length === 0,
    reasons,
    counts,
  };
}

const DEG = 180 / Math.PI;

/** Fixed decimals with a true minus sign; 'unavailable' for non-finite values. */
export function formatValue(x: number, decimals: number): string {
  if (!Number.isFinite(x)) return 'unavailable';
  const s = Math.abs(x).toFixed(decimals);
  return x < 0 && Number(s) !== 0 ? `−${s}` : s;
}

const render = (r: ShadowResult) => `the ${r.side} render`;

export function toleranceText(r: ShadowResult): string {
  return `1 px of ${render(r)} or 0.5 %, whichever is larger: ${formatValue(r.tolerancePx, 2)} px`;
}

/** Rows of the panel's description list, in order. */
export function resultRows(r: ShadowResult): { label: string; value: string }[] {
  const px = (v: number) => `${formatValue(v, 2)} px of ${render(r)}`;
  return [
    { label: 'Observer distance', value: `${formatValue(r.distance, 1)} M` },
    { label: 'Field of view', value: `${formatValue(r.fovYDeg, 1)} degrees (vertical)` },
    {
      label: 'Analytic angular radius',
      value: `${formatValue(r.analyticRad * DEG, 4)} degrees, ${px(r.analyticPx)}`,
    },
    {
      label: 'Measured angular radius',
      value:
        `${formatValue(r.measuredRad * DEG, 4)} degrees, ${px(r.measuredPx)}, ` +
        `from ${r.counts.colour.black} black pixels`,
    },
    {
      label: 'Difference',
      value: `${px(r.diffPx)} (${formatValue(100 * r.relativeError, 3)} % of the angle)`,
    },
    { label: 'Tolerance', value: toleranceText(r) },
    {
      label: 'Result',
      value: r.pass ? 'Within tolerance' : `Outside tolerance: ${r.reasons.join('; ')}`,
    },
    { label: 'Step-limit pixels', value: `${r.counts.termination.stepLimit} (expected 0)` },
    {
      label: 'Largest disagreement with the analytic edge',
      value: px(r.counts.maxDisagreementPx),
    },
  ];
}

/** The rows that do not need a measurement, for a camera whose result is still pending. */
export function analyticRows(
  distance: number,
  fovYDeg: number,
  side: number,
): { rows: { label: string; value: string }[]; analyticPx: number; tolerancePx: number } {
  const t = Math.tan((fovYDeg * Math.PI) / 360);
  const analyticRad = shadowAngularRadius(distance, 1);
  const analyticPx = imageRadiusFromConeAngle(analyticRad, side, t);
  const tolerancePx = Math.max(1, 0.005 * analyticPx);
  const where = `px of the ${side} render`;
  return {
    analyticPx,
    tolerancePx,
    rows: [
      { label: 'Observer distance', value: `${formatValue(distance, 1)} M` },
      { label: 'Field of view', value: `${formatValue(fovYDeg, 1)} degrees (vertical)` },
      {
        label: 'Analytic angular radius',
        value: `${formatValue(analyticRad * DEG, 4)} degrees, ${formatValue(analyticPx, 2)} ${where}`,
      },
      {
        label: 'Tolerance',
        value: `1 px of the ${side} render or 0.5 %, whichever is larger: ${formatValue(tolerancePx, 2)} px`,
      },
    ],
  };
}

/** One sentence for the live region when a measurement completes. */
export function announcement(r: ShadowResult): string {
  const verdict = r.pass ? 'within tolerance' : 'outside tolerance';
  return (
    `Shadow at ${formatValue(r.distance, 1)} M: measured ${formatValue(r.measuredRad * DEG, 3)} ` +
    `degrees, analytic ${formatValue(r.analyticRad * DEG, 3)} degrees, ${verdict}.`
  );
}
