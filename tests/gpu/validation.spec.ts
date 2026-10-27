// The Validation panel's measurement on the GPU (Stage 4; spec section 4 shadow target): the
// shadow measured on an offscreen 1024 x 1024 validation render of the shipped WGSL, against the
// analytic angular radius, with the brief's tolerance. Run with npm run test:gpu.
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { renderImage } from '../../src/cpu-renderer/render.ts';
import { validationScene } from '../../src/cpu-renderer/scenes.ts';
import {
  autoFieldOfView,
  cameraFrame,
  criticalImpactParameter,
  pixelDirection,
  shadowAngularRadius,
  type Vec3,
} from '../../src/physics/index.ts';
import { shadowResult } from '../../src/ui/validation.ts';
import type { HarnessImageRequest } from './harness-api.ts';
import { openHarness } from './page.ts';

const M = 1;
const SIDE = 1024;
/** The f32 parity band (VALIDATION item 11): |b/b_c - 1| below this may classify either way. */
const BAND = 1e-3;

test.describe('shadow measured on the GPU validation render', () => {
  test('within 1 px or 0.5 % at six distances, with no step-limit pixels', async ({ page }) => {
    test.setTimeout(300_000);
    await openHarness(page);
    const rows = [];
    for (const distance of [5, 6, 10, 30, 100, 200]) {
      const fovYDeg = autoFieldOfView(distance, M, 60);
      const req = { distance, azimuthDeg: 0, elevationDeg: 12, fovYDeg, side: SIDE };
      const { counts } = await page.evaluate((r) => window.harness!.measureShadow(r), req);
      const res = shadowResult({ distance, fovYDeg, side: SIDE, counts });
      const where = `${distance} M`;
      expect(res.reasons, where).toEqual([]);
      expect(res.pass, where).toBe(true);
      expect(counts.termination.stepLimit, where).toBe(0);
      expect(counts.colour.other, where).toBe(0);
      expect(counts.termination.other, where).toBe(0);
      expect(counts.colour.touchesBorder, where).toBe(false);
      // Colour black is expected to equal captured plus step limit, pixel by pixel: any pixel
      // classified differently by the two entry points must lie in the f32 band.
      const mismatches = counts.blackNotCapturedOrStepLimit + counts.whiteCapturedOrStepLimit;
      if (mismatches > 0) expect(counts.worstMismatchBand, where).toBeLessThan(BAND);
      expect(
        Math.abs(counts.colour.black - counts.termination.captured - counts.termination.stepLimit),
      ).toBeLessThanOrEqual(mismatches);
      if (counts.capturedOutside + counts.notCapturedInside > 0) {
        expect(counts.worstDisagreementBand, where).toBeLessThan(BAND);
      }
      rows.push({
        distance,
        fovYDeg,
        analyticDeg: (res.analyticRad * 180) / Math.PI,
        measuredDeg: (res.measuredRad * 180) / Math.PI,
        analyticPx: res.analyticPx,
        measuredPx: res.measuredPx,
        diffPx: res.diffPx,
        tolerancePx: res.tolerancePx,
        relativeError: res.relativeError,
        black: counts.colour.black,
        captured: counts.termination.captured,
        blackNotCaptured: counts.blackNotCapturedOrStepLimit,
        whiteCaptured: counts.whiteCapturedOrStepLimit,
        capturedOutside: counts.capturedOutside,
        notCapturedInside: counts.notCapturedInside,
        maxDisagreementPx: counts.maxDisagreementPx,
      });
      console.log(
        `${where}: measured ${res.measuredPx.toFixed(3)} px, analytic ${res.analyticPx.toFixed(3)} px, ` +
          `diff ${res.diffPx.toFixed(3)} px (tolerance ${res.tolerancePx.toFixed(2)}), ` +
          `disagreements ${counts.capturedOutside}+${counts.notCapturedInside}, ` +
          `max ${counts.maxDisagreementPx.toFixed(3)} px`,
      );
    }
    mkdirSync('artifacts/stage4', { recursive: true });
    writeFileSync('artifacts/stage4/shadow-gpu.json', JSON.stringify(rows, null, 2));
  });

  test('framed so the analytic radius is 256 px, the 0.5 % rule binds far away', async ({
    page,
  }) => {
    await openHarness(page);
    for (const distance of [10, 30, 100, 200]) {
      const tanPsi = Math.tan(shadowAngularRadius(distance, M));
      const fovYDeg = (2 * Math.atan((tanPsi * SIDE) / (2 * 256)) * 180) / Math.PI;
      expect(fovYDeg).toBeLessThanOrEqual(92.8);
      const req = { distance, azimuthDeg: 0, elevationDeg: 12, fovYDeg, side: SIDE };
      const { counts } = await page.evaluate((r) => window.harness!.measureShadow(r), req);
      const res = shadowResult({ distance, fovYDeg, side: SIDE, counts });
      expect(res.analyticPx).toBeCloseTo(256, 9);
      expect(Math.abs(res.diffPx), `${distance} M`).toBeLessThanOrEqual(1.28);
      console.log(`${distance} M framed: diff ${res.diffPx.toFixed(3)} px of 256`);
    }
  });

  test('the GPU validation render matches the CPU reference pixel mask', async ({ page }) => {
    test.setTimeout(300_000);
    await openHarness(page);
    const BC = criticalImpactParameter(M);
    for (const distance of [5, 30, 200]) {
      const s = validationScene(distance, 320, 180);
      const cpu = renderImage(s);
      const request: HarnessImageRequest = {
        width: 320,
        height: 180,
        camera: s.camera,
        mode: 'colour',
        sky: 'uniform',
        exposure: 1,
        toneMapping: false,
        disk: null,
        antialias: false,
      };
      const gpu = await page.evaluate((r) => window.harness!.renderImage(r), request);
      const f = cameraFrame(s.camera, M);
      let mismatches = 0;
      for (let j = 0; j < 180; j++) {
        for (let i = 0; i < 320; i++) {
          const p = j * 320 + i;
          const cpuBlack =
            cpu.linear[3 * p] === 0 && cpu.linear[3 * p + 1] === 0 && cpu.linear[3 * p + 2] === 0;
          const gpuBlack =
            gpu.rgb[3 * p] === 0 && gpu.rgb[3 * p + 1] === 0 && gpu.rgb[3 * p + 2] === 0;
          if (cpuBlack === gpuBlack) continue;
          mismatches++;
          const d: Vec3 = pixelDirection(f, 320, 180, i + 0.5, j + 0.5);
          const cos = d[0] * f.forward[0] + d[1] * f.forward[1] + d[2] * f.forward[2];
          const b = (distance * Math.sqrt(1 - cos * cos)) / Math.sqrt(1 - (2 * M) / distance);
          expect(Math.abs(b / BC - 1), `${distance} M pixel ${i},${j}`).toBeLessThan(BAND);
        }
      }
      console.log(`${distance} M: ${mismatches} of ${320 * 180} pixels differ in the black mask`);
    }
  });

  test('measuring leaves the interactive images untouched', async ({ page }) => {
    await openHarness(page);
    const image: HarnessImageRequest = {
      width: 320,
      height: 180,
      camera: { distance: 30, azimuthDeg: 20, elevationDeg: 12, fovYDeg: 60 },
      mode: 'colour',
      sky: 'stars',
      exposure: 1,
      toneMapping: true,
      disk: null,
      antialias: true,
    };
    const shadow = {
      distance: 12,
      azimuthDeg: 0,
      elevationDeg: 40,
      fovYDeg: autoFieldOfView(12, M, 60),
      side: SIDE,
    };
    const r = await page.evaluate(([a, b]) => window.harness!.measurementIsolation(a, b), [
      image,
      shadow,
    ] as const);
    expect(r.bytes).toBe(320 * 180 * 3);
    expect(r.identical).toBe(true);
  });
});
