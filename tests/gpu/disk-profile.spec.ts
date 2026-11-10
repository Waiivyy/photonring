// The Page-Thorne temperature profile on the GPU (Stage 8): T-hat(r), the temperature in the
// gas's own frame over its peak value, from the shipped WGSL (temperatureHat in
// src/shaders/disk.wgsl, through the table of src/gpu/host/disk-table.ts), against the f64
// library at the f32 radius the GPU receives. M = 1, the page's mass: 6M is exact in f32, so
// r - 6M is exact near the ISCO. The disk cut at 7 M must give the same profile, because the zero
// torque stays at 6 M. Run with npm run test:gpu.
import { expect, test } from '@playwright/test';
import {
  DEFAULT_DISK,
  diskTemperatureHat,
  pageThornePeakRadius,
  type DiskSettings,
} from '../../src/physics/index.ts';
import { relErr } from '../helpers/numeric.ts';
import { openHarness } from './page.ts';

const M = 1;
/**
 * Relative error allowed against T-hat at the f32 radius. Guessed as 1e-5 before the first run
 * (the f32 emulation of the WGSL steps gives 4.5e-7, tests/unit/gpu-host.test.ts) and settled on
 * it: 5.26e-7 measured at r = 6.308 M (Apple M5, macOS 27.0, Google Chrome 157.0.8103.38,
 * 2026-11-08), so 2e-6, the bound of the emulation test (docs/VALIDATION.md, Tolerance changes).
 */
const TOLERANCE = 2e-6;

/** 4096 radii from 6M (1 + 1e-4) to 1000 M, geometric, and the peak radius. */
function radii(): number[] {
  const lo = 6 * M * (1 + 1e-4);
  const hi = 1000 * M;
  const out = [pageThornePeakRadius(M)];
  for (let k = 0; k < 4096; k++) out.push(lo * (hi / lo) ** (k / 4095));
  return out;
}

/** The first f32 radii above 6M, where s = sqrt(6M / r) rounds to 1 or just below it. */
function firstAboveIsco(): number[] {
  const ulp = 2 ** (Math.floor(Math.log2(6 * M)) - 23);
  return Array.from({ length: 8 }, (_, k) => 6 * M + (k + 1) * ulp);
}

const INSIDE = [6 * M, 5.9 * M, 4 * M, 3 * M, 0];

const DISKS: [string, DiskSettings][] = [
  ['the default disk (6 M to 20 M)', DEFAULT_DISK],
  ['a disk cut at 7 M', { ...DEFAULT_DISK, rIn: 7 }],
];

test.describe('Page-Thorne profile from the shipped WGSL', () => {
  for (const [label, disk] of DISKS) {
    test(`${label}: T-hat against the f64 library at the f32 radius`, async ({ page }) => {
      await openHarness(page);
      const outside = radii();
      const edge = firstAboveIsco();
      const all = [...outside, ...edge, ...INSIDE];
      const gpu = await page.evaluate(([r, d]) => window.harness!.diskProfile(r, d), [
        all,
        disk,
      ] as const);
      expect(gpu.length).toBe(all.length);

      let worst = 0;
      let worstAt = 0;
      outside.forEach((r, k) => {
        const e = relErr(gpu[k]!, diskTemperatureHat(Math.fround(r), M));
        if (!(e <= worst)) {
          worst = e;
          worstAt = r;
        }
      });
      let worstEdge = 0;
      edge.forEach((r, k) => {
        const v = gpu[outside.length + k]!;
        expect(Number.isFinite(v) && v >= 0, `r = ${r}`).toBe(true);
        worstEdge = Math.max(worstEdge, relErr(v, diskTemperatureHat(r, M)));
      });
      const inside = gpu.slice(outside.length + edge.length);
      console.log(
        `${label}: ${outside.length} radii, worst relative error ${worst.toExponential(2)} at ` +
          `r = ${worstAt.toPrecision(6)} M; first 8 f32 radii above 6M: worst ` +
          `${worstEdge.toExponential(2)}; at and inside 6M: ${inside.join(', ')}`,
      );
      expect(worst, label).toBeLessThan(TOLERANCE);
      expect(worstEdge, label).toBeLessThan(TOLERANCE);
      expect(inside).toEqual(INSIDE.map(() => 0));
    });
  }

  test('the renderer checks its disk with assertDiskSettings', async ({ page }) => {
    await openHarness(page);
    const rejected: [string, Partial<DiskSettings>, number][] = [
      ['an inner edge inside the ISCO', { rIn: 5.9 }, 1],
      ['an inner edge inside the ISCO of M = 2', { rIn: 11.9, rOut: 40 }, 2],
      ['M = 0', {}, 0],
      ['a negative M', {}, -1],
      ['an outer edge at the inner edge', { rOut: 6 }, 1],
      ['an infinite outer edge', { rOut: Infinity }, 1],
      ['opacity below 0', { opacity: -0.1 }, 1],
      ['opacity above 1', { opacity: 1.1 }, 1],
      ['a peak temperature of 0', { peakTemperature: 0 }, 1],
      ['a peak temperature that is not a number', { peakTemperature: NaN }, 1],
    ];
    const accepted: [string, Partial<DiskSettings>, number][] = [
      ['the default disk', {}, 1],
      ['a disk at the ISCO of M = 2', { rIn: 12, rOut: 40 }, 2],
      ['a disk cut at 7 M', { rIn: 7 }, 1],
    ];
    const check = (M: number, disk: DiskSettings) =>
      page.evaluate(([m, d]) => window.harness!.sceneError(m, d), [M, disk] as const);
    for (const [label, patch, M] of rejected) {
      expect(await check(M, { ...DEFAULT_DISK, ...patch }), label).toContain('RangeError');
    }
    for (const [label, patch, M] of accepted) {
      expect(await check(M, { ...DEFAULT_DISK, ...patch }), label).toBeNull();
    }
  });
});
