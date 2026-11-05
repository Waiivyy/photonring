// What the photon subring view draws over its strip: the predicted band edges, labels, the
// measured 32-bit limit and the legend text (src/ui/strip-overlay.ts).
import { describe, expect, it } from 'vitest';
import {
  cameraFrame,
  criticalImpactParameter,
  DEFAULT_DISK,
  firstPlaneCrossingAngle,
  ringImageAngle,
  stripDirection,
  stripRange,
  subringOffset,
  traceRay,
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

  for (const [distance, elevation] of [
    [30, 12],
    [15, 12],
    [5, 12],
    [30, -40],
  ] as const) {
    it(`draws the edges the 64-bit library predicts at every sampled angle, ${distance} M, elevation ${elevation}`, () => {
      const d = stripDrawing(distance, elevation);
      const el = (elevation * Math.PI) / 180;
      const k = Math.sqrt(1 - 2 / distance) / distance;
      const f = cameraFrame({ distance, azimuthDeg: 0, elevationDeg: elevation, fovYDeg: 60 });
      let total = 0;
      let traced = 0;
      for (const line of d.lines.filter((l) => l.kind === 'inner' || l.kind === 'outer')) {
        const R = line.kind === 'inner' ? DEFAULT_DISK.rIn : DEFAULT_DISK.rOut;
        const n = line.order!;
        line.points.forEach(([x, logEps], i) => {
          total++;
          const theta = 2 * Math.PI * x;
          const phi0 = firstPlaneCrossingAngle(Math.sin(el), Math.sin(theta) * Math.cos(el))!;
          const eps =
            n >= 1
              ? subringOffset(distance, R, n, phi0)
              : Math.sin(ringImageAngle(distance, R, phi0)) / (k * criticalImpactParameter(1)) - 1;
          expect(Math.abs(Math.log10(eps) - logEps)).toBeLessThan(1e-12);
          // The strip shows inward directions only: the ray through the drawn point must reach R
          // at crossing n (checked by tracing it, for the orders f64 tracing resolves well).
          if (n <= 3 && i % 6 === 0) {
            const ray = traceRay(1, f.position, stripDirection(f, distance, eps, theta), {
              dphi: 0.002,
              maxSteps: 100_000,
            });
            expect(ray.crossings[n], `order ${n}, theta ${theta}`).toBeDefined();
            expect(Math.abs(ray.crossings[n]!.radius - R)).toBeLessThan(1e-4 * R);
            traced++;
          }
        });
      }
      expect(total).toBeGreaterThan(400);
      expect(traced).toBeGreaterThan(30);
    });
  }

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
