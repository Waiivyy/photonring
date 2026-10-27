// Renders the check-in views with the GPU renderer into artifacts/stage3/ (not a pass/fail test).
// Run with npm run gallery:gpu, then open the PNG files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { encodePng } from '../../src/cpu-renderer/png.ts';
import { autoFieldOfView, DEFAULT_DISK, type CameraParams } from '../../src/physics/index.ts';
import type { HarnessImageRequest } from '../gpu/harness-api.ts';
import { openHarness } from '../gpu/page.ts';

const WIDTH = 1920;
const HEIGHT = 1080;
const OUT = 'artifacts/stage3';

const camera = (c: Partial<CameraParams>): CameraParams => ({
  distance: 30,
  azimuthDeg: 0,
  elevationDeg: 12,
  fovYDeg: 60,
  ...c,
});

const base: HarnessImageRequest = {
  width: WIDTH,
  height: HEIGHT,
  camera: camera({}),
  mode: 'colour',
  sky: 'stars',
  exposure: 1,
  toneMapping: true,
  disk: DEFAULT_DISK,
  antialias: true,
};

const ring = camera({ fovYDeg: 24 });
const views: [file: string, request: HarnessImageRequest, previewScale?: number][] = [
  ['01-default.png', base],
  ['02-default-no-antialiasing.png', { ...base, antialias: false }],
  ['03-photon-ring-close-up.png', { ...base, camera: ring }],
  ['04-photon-ring-close-up-no-antialiasing.png', { ...base, camera: ring, antialias: false }],
  ['05-face-on.png', { ...base, camera: camera({ elevationDeg: 90 }) }],
  ['06-nearly-edge-on.png', { ...base, camera: camera({ elevationDeg: 2 }) }],
  [
    '07-close-5M.png',
    {
      ...base,
      camera: camera({ distance: 5, elevationDeg: 20, fovYDeg: autoFieldOfView(5, 1, 60) }),
    },
  ],
  ['08-far-200M.png', { ...base, camera: camera({ distance: 200 }) }],
  ['09-no-disk.png', { ...base, disk: null }],
  ['10-termination-view.png', { ...base, mode: 'termination' }],
  ['11-while-moving-preview-half.png', base, 0.5],
];

test('GPU check-in views', async ({ page }) => {
  test.setTimeout(300_000);
  await openHarness(page);
  mkdirSync(OUT, { recursive: true });
  for (const [file, request, previewScale] of views) {
    const b64 = await page.evaluate(([r, s]) => window.harness!.renderImageBase64(r, s), [
      request,
      previewScale,
    ] as const);
    const rgb = new Uint8Array(Buffer.from(b64, 'base64'));
    writeFileSync(`${OUT}/${file}`, encodePng(WIDTH, HEIGHT, rgb));
    console.log(`wrote ${OUT}/${file}`);
  }
});
