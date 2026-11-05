// Adaptive anti-aliasing on the GPU (Stage 3). Refined pixels must equal the CPU's 3 x 3
// supersampled render, the others its one-sample render; the refined set must contain the
// critical band and every clear step in the one-sample image. Run with npm run test:gpu.
import { expect, test } from '@playwright/test';
import {
  encodeImage,
  renderImage,
  type RenderOutput,
  type RenderSettings,
} from '../../src/cpu-renderer/render.ts';
import { GOLDEN_SCENES } from '../../src/cpu-renderer/scenes.ts';
import {
  AA_THRESHOLD,
  criticalBand,
  inCriticalBand,
  perceivedValue,
} from '../../src/gpu/host/antialias.ts';
import {
  autoFieldOfView,
  cameraFrame,
  pixelDirection,
  type Vec3,
} from '../../src/physics/index.ts';
import type { HarnessImageRequest } from './harness-api.ts';
import { openHarness } from './page.ts';

/** Largest perceived difference between a pixel and its 8 neighbours (edges clamped). */
function contrast(out: RenderOutput, s: RenderSettings, i: number, j: number): number {
  const at = (x: number, y: number) => {
    const p =
      (Math.min(s.height - 1, Math.max(0, y)) * s.width + Math.min(s.width - 1, Math.max(0, x))) *
      3;
    const l = out.linear;
    return perceivedValue([l[p]!, l[p + 1]!, l[p + 2]!], s.exposure, s.toneMapping);
  };
  const v0 = at(i, j);
  let worst = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) worst = Math.max(worst, Math.abs(at(i + dx, j + dy) - v0));
  }
  return worst;
}

test('anti-aliased images against the CPU reference', async ({ page }) => {
  test.setTimeout(300_000);
  await openHarness(page);
  const inclined = GOLDEN_SCENES.diskInclined;
  const cases: [string, RenderSettings][] = [
    ['inclined disk', inclined],
    ['face-on disk', GOLDEN_SCENES.diskFaceOn],
    [
      'close view at 5 M',
      {
        ...inclined,
        camera: {
          distance: 5,
          azimuthDeg: 0,
          elevationDeg: 20,
          fovYDeg: autoFieldOfView(5, 1, 60),
        },
      },
    ],
    ['no disk', GOLDEN_SCENES.noDisk],
  ];
  for (const [label, scene] of cases) {
    const s1: RenderSettings = { ...scene, samplesPerAxis: 1 };
    const s3: RenderSettings = { ...scene, samplesPerAxis: 3 };
    const request: HarnessImageRequest = {
      width: scene.width,
      height: scene.height,
      camera: scene.camera,
      mode: scene.mode,
      sky: scene.sky,
      exposure: scene.exposure,
      toneMapping: scene.toneMapping,
      disk: scene.disk,
      antialias: true,
    };
    const gpu = await page.evaluate((r) => window.harness!.renderImage(r), request);
    const one = renderImage(s1);
    const oneRgb = encodeImage(one, s1);
    const nineRgb = encodeImage(renderImage(s3), s3);

    const f = cameraFrame(scene.camera, scene.M);
    const r0 = scene.camera.distance;
    const e1: Vec3 = [f.position[0] / r0, f.position[1] / r0, f.position[2] / r0];
    const band = criticalBand(r0, scene.M, f.tanHalfFovY, scene.height);
    const inset = { cosMin: band.cosMin + 1e-6, cosMax: band.cosMax - 1e-6 };
    let refined = 0;
    let over2 = 0;
    let bandMissed = 0;
    let stepMissed = 0;
    let flatRefined = 0;
    for (let j = 0; j < scene.height; j++) {
      for (let i = 0; i < scene.width; i++) {
        const p = j * scene.width + i;
        const samples = gpu.samples[p]!;
        expect([1, 9]).toContain(samples);
        if (samples === 9) refined++;
        const ref = samples === 9 ? nineRgb : oneRgb;
        for (let c = 0; c < 3; c++) {
          if (Math.abs(gpu.rgb[3 * p + c]! - ref[3 * p + c]!) > 2) over2++;
        }
        const d = pixelDirection(f, scene.width, scene.height, i + 0.5, j + 0.5);
        const inBand = inCriticalBand(inset, e1, d);
        if (inBand && samples !== 9) bandMissed++;
        // Clear steps must be refined; flat areas outside the band must not be. The margins
        // absorb the f16 storage and f32 arithmetic of the GPU's one-sample image.
        const k = contrast(one, s1, i, j);
        if (k > 1.5 * AA_THRESHOLD && samples !== 9) stepMissed++;
        if (!inCriticalBand(band, e1, d) && k < 0.5 * AA_THRESHOLD && samples === 9) {
          flatRefined++;
        }
      }
    }
    const total = scene.width * scene.height;
    console.log(
      `${label}: ${((100 * refined) / total).toFixed(1)} % of pixels refined; ` +
        `${over2} of ${3 * total} channels differ by more than 2`,
    );
    expect(bandMissed, label).toBe(0);
    expect(stepMissed, label).toBe(0);
    expect(flatRefined, label).toBe(0);
    expect(over2 / (3 * total), label).toBeLessThan(5e-3);
  }
});

test('anti-aliasing off leaves every pixel with one sample', async ({ page }) => {
  await openHarness(page);
  const s = GOLDEN_SCENES.diskInclined;
  const gpu = await page.evaluate((r) => window.harness!.renderImage(r), {
    width: s.width,
    height: s.height,
    camera: s.camera,
    mode: s.mode,
    sky: s.sky,
    exposure: s.exposure,
    toneMapping: s.toneMapping,
    disk: s.disk,
    antialias: false,
  } satisfies HarnessImageRequest);
  expect(gpu.samples.every((n) => n === 1)).toBe(true);
});
