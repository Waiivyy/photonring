// Placement of the legend drawn into saved images (Stage 4 screenshot export).
import { describe, expect, it } from 'vitest';
import { legendLayout } from '../../src/ui/legend-layout.ts';

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Item ${i} label` }));

describe('legend layout', () => {
  it('is null when there is nothing to explain', () => {
    expect(legendLayout(1920, 1080, [], 1)).toBeNull();
  });

  it('sits inside the image at the bottom right, with a margin', () => {
    for (const [w, h, scale] of [
      [1920, 1080, 1],
      [3840, 2160, 2],
      [1170, 2532, 3],
      [640, 360, 1],
    ] as const) {
      const box = legendLayout(w, h, items(4), scale)!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeCloseTo(w - box.margin, 9);
      expect(box.y + box.height).toBeCloseTo(h - box.margin, 9);
      expect(box.margin).toBeGreaterThan(0);
      expect(box.rows).toHaveLength(4);
      for (const row of box.rows) {
        expect(row.y).toBeGreaterThan(box.y);
        expect(row.y).toBeLessThan(box.y + box.height);
      }
    }
  });

  it('grows with the number of items and with the scale', () => {
    const one = legendLayout(1920, 1080, items(1), 1)!;
    const three = legendLayout(1920, 1080, items(3), 1)!;
    const big = legendLayout(1920, 1080, items(3), 2)!;
    expect(three.height).toBeGreaterThan(one.height);
    expect(big.height).toBeCloseTo(2 * three.height, 9);
    expect(big.width).toBeCloseTo(2 * three.width, 9);
    expect(
      legendLayout(1920, 1080, [{ label: 'a much longer legend label' }], 1)!.width,
    ).toBeGreaterThan(legendLayout(1920, 1080, [{ label: 'short' }], 1)!.width);
  });

  it('stays inside a small image', () => {
    const box = legendLayout(120, 80, items(6), 1)!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });
});
