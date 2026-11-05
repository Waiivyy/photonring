// Benchmark of the EHT-style view's post-process (Stage 7). Not a pass/fail test: it prints the GPU
// time of one present (six compute passes and the colour-mapped upsample) by camera and
// resolution, a reference with the reduce switched off, and the colour view's blit, and writes
// artifacts/stage7/benchmark.json. Run with npm run bench:gpu.
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { ehtPlan } from '../../src/gpu/host/eht-post.ts';
import {
  DEFAULT_DISK,
  ehtFieldOfView,
  M87_SKY_ROLL_DEG,
  type CameraParams,
} from '../../src/physics/index.ts';
import type { HarnessImageRequest } from '../gpu/harness-api.ts';
import { openHarness } from '../gpu/page.ts';

const REPEATS = 15;
const resolutions: [number, number][] = [
  [960, 540],
  [1920, 1080],
  [3840, 2160],
];
const ehtCamera = (distance: number, elevationDeg: number, aspect: number): CameraParams => ({
  distance,
  azimuthDeg: 0,
  elevationDeg,
  fovYDeg: ehtFieldOfView(distance, aspect),
  rollDeg: M87_SKY_ROLL_DEG,
});
const cameras: Record<string, (aspect: number) => CameraParams> = {
  'preset (200 M, -73 deg)': (a) => ehtCamera(200, -73, a),
  'default camera (30 M, 12 deg)': (a) => ehtCamera(30, 12, a),
};

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] as number;

test('GPU time of the EHT-style present by camera and resolution', async ({ page }) => {
  test.setTimeout(600_000);
  const info = await openHarness(page);
  const browser = page.context().browser();
  const header =
    `GPU ${info.vendor} ${info.architecture}, ${browser?.browserType().name()} ${browser?.version()}, ` +
    `headless, median of ${REPEATS}`;
  console.log(header);
  console.log('| present | camera | resolution | reduce | reduced grid | ms |');
  console.log('|---|---|---|---|---|---|');
  const rows: Record<string, unknown>[] = [];
  const run = async (
    label: string,
    cameraName: string,
    request: HarnessImageRequest,
    factor?: number,
  ) => {
    const r = await page.evaluate(([req, n, f]) => window.harness!.benchmarkPresent(req, n, f), [
      request,
      REPEATS,
      factor,
    ] as const);
    const plan = ehtPlan(request.camera, request.width, request.height, 1, factor);
    const eht = request.mode === 'eht';
    const ms = median(r.ms);
    rows.push({
      present: label,
      camera: cameraName,
      width: request.width,
      height: request.height,
      factor: eht ? plan.f : null,
      lowWidth: eht ? plan.lowWidth : null,
      lowHeight: eht ? plan.lowHeight : null,
      timing: r.timing,
      medianMs: ms,
      ms: r.ms,
    });
    console.log(
      `| ${label} | ${cameraName} | ${request.width} x ${request.height} | ${eht ? plan.f : '-'} | ` +
        `${eht ? `${plan.lowWidth} x ${plan.lowHeight}` : '-'} | ${ms.toFixed(3)} |`,
    );
  };
  const request = (camera: CameraParams, width: number, height: number, mode: 'eht' | 'colour') =>
    ({
      width,
      height,
      camera,
      mode,
      sky: mode === 'eht' ? 'black' : 'stars',
      exposure: 1,
      toneMapping: mode === 'colour',
      disk: DEFAULT_DISK,
      antialias: false,
    }) satisfies HarnessImageRequest;

  for (const [name, make] of Object.entries(cameras)) {
    for (const [w, h] of resolutions)
      await run('EHT post-process', name, request(make(w / h), w, h, 'eht'));
  }
  const preset = cameras['preset (200 M, -73 deg)']!;
  await run(
    'EHT without the reduce (f = 1)',
    'preset (200 M, -73 deg)',
    request(preset(16 / 9), 960, 540, 'eht'),
    1,
  );
  for (const [w, h] of resolutions) {
    await run(
      'colour view blit',
      'default (30 M, 12 deg, fov 60)',
      request({ distance: 30, azimuthDeg: 0, elevationDeg: 12, fovYDeg: 60 }, w, h, 'colour'),
    );
  }
  mkdirSync('artifacts/stage7', { recursive: true });
  writeFileSync(
    'artifacts/stage7/benchmark.json',
    JSON.stringify({ header, date: new Date().toISOString(), repeats: REPEATS, rows }, null, 1),
  );
});
