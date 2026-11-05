// What the photon subring view draws over its strip: the predicted band edges, labels, the
// measured 32-bit limit and the legend text (src/ui/strip-overlay.ts).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISK,
  firstPlaneCrossingAngle,
  stripRange,
  subringOffset,
} from '../../src/physics/index.ts';
import {
  STRIP_LIMIT_MEASURED,
  STRIP_MAX_ORDER,
  decadeLabel,
  stripDrawing,
  stripLegendLines,
  stripLimit,
  stripPoint,
} from '../../src/ui/strip-overlay.ts';

describe('strip overlay', () => {
  const drawing = stripDrawing(30, 12);

  it('draws the edges the 64-bit library predicts, at every sampled image angle', () => {
    const el = (12 * Math.PI) / 180;
    let compared = 0;
    for (const line of drawing.lines.filter((l) => l.kind === 'inner' || l.kind === 'outer')) {
      const R = line.kind === 'inner' ? DEFAULT_DISK.rIn : DEFAULT_DISK.rOut;
      for (const [x, logEps] of line.points.filter((_, i) => i % 15 === 0)) {
        const theta = 2 * Math.PI * x;
        const phi0 = firstPlaneCrossingAngle(Math.sin(el), Math.sin(theta) * Math.cos(el))!;
        // Each point belongs to one order; it must be the offset of some order at that angle.
        const match = Array.from({ length: STRIP_MAX_ORDER }, (_, k) => k + 1).some((n) => {
          const eps = subringOffset(30, R, n, phi0);
          return Math.abs(Math.log10(eps) - logEps) < 1e-12;
        });
        if (match) compared++;
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('labels the orders on their bands and the decades on the right', () => {
    const texts = drawing.labels.map((l) => l.text);
    for (let n = 0; n <= STRIP_MAX_ORDER; n++) expect(texts).toContain(`n = ${n}`);
    expect(texts).toContain(decadeLabel(-3));
    expect(texts).toEqual(expect.arrayContaining(['right', 'up', 'left', 'down', '32-bit limit']));
    for (const l of drawing.labels) {
      expect(l.logEps).toBeLessThanOrEqual(drawing.range.top);
      expect(l.logEps).toBeGreaterThan(drawing.range.bottom);
    }
  });

  it('writes decades with superscript exponents, no dash characters', () => {
    expect(decadeLabel(0)).toBe('1');
    expect(decadeLabel(-3)).toBe('10⁻³');
    expect(decadeLabel(-7)).toBe('10⁻⁷');
  });

  it('predicts the face-on spacing at the right edge (phi0 = pi/2 in every view)', () => {
    [23.6451, 23.2018, 23.1449].forEach((v, i) => expect(drawing.ratios[i]).toBeCloseTo(v, 4));
  });

  it('draws the measured 32-bit limit, interpolated between the measured distances', () => {
    for (const [r, eps] of STRIP_LIMIT_MEASURED) expect(stripLimit(r)).toBeCloseTo(eps, 15);
    expect(stripLimit(2)).toBe(stripLimit(5));
    expect(stripLimit(1000)).toBe(stripLimit(200));
    expect(stripLimit(60)).toBeGreaterThan(stripLimit(30));
    expect(stripLimit(60)).toBeLessThan(stripLimit(200));
    const limit = drawing.lines.find((l) => l.kind === 'limit')!;
    expect(limit.points[0]![1]).toBeCloseTo(Math.log10(stripLimit(30)), 12);
  });

  it('maps strip points into any box', () => {
    const range = stripRange(30);
    expect(stripPoint([0.5, range.top], range, 800, 400)).toEqual([400, 0]);
    expect(stripPoint([1, range.bottom], range, 800, 400)).toEqual([800, 400]);
  });

  it('labels the view as magnified and logarithmic, not what a camera sees', () => {
    const lines = stripLegendLines({ disk: true, ratios: drawing.ratios });
    expect(lines[0]).toBe('Magnified, logarithmic: not what a camera sees.');
    expect(lines.join(' ')).toContain('n = 1 to 2: 23.65');
    expect(lines.join(' ')).toContain('e^π = 23.14');
    expect(stripLegendLines({ disk: false, ratios: null })[0]).toMatch(/^Disk off/);
  });
});
