// GPU frame-time benchmark (Stage 2, no disk). Not a pass/fail test: it prints a table and
// writes artifacts/stage2/benchmark.json. Run with npm run bench:gpu.
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { autoFieldOfView } from '../../src/physics/index.ts';
import type { HarnessImageRequest } from '../gpu/harness-api.ts';

const views = {
  'default (30 M, 12 deg, fov 60)': { distance: 30, azimuthDeg: 0, elevationDeg: 12, fovYDeg: 60 },
  'close (5 M, 20 deg, fov 120)': {
    distance: 5,
    azimuthDeg: 0,
    elevationDeg: 20,
    fovYDeg: autoFieldOfView(5, 1, 60),
  },
  'far (200 M, 12 deg, fov 60)': { distance: 200, azimuthDeg: 0, elevationDeg: 12, fovYDeg: 60 },
};
const resolutions: [number, number][] = [
  [960, 540],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
};

test('GPU frame time by view and resolution', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/tests/gpu/harness.html');
  const info = await page.evaluate(() => window.harness!.ready);
  const browser = page.context().browser();
  const rows: Record<string, unknown>[] = [];
  console.log(
    `GPU ${info.vendor} ${info.architecture}, ${browser?.browserType().name()} ${browser?.version()}, headless`,
  );
  console.log(
    '| view | resolution | GPU ms (median of 9) | GPU ms (min) | wall ms (median) | Mrays/s (GPU median) |',
  );
  console.log('|---|---|---|---|---|---|');
  for (const [name, camera] of Object.entries(views)) {
    for (const [width, height] of resolutions) {
      const request: HarnessImageRequest = {
        width,
        height,
        camera,
        mode: 'colour',
        sky: 'stars',
        exposure: 1,
        toneMapping: true,
        disk: null,
        antialias: false,
      };
      const r = await page.evaluate(([req, n]) => window.harness!.benchmark(req, n), [
        request,
        9,
      ] as const);
      const gpu = r.gpuMs.filter((x): x is number => x !== null);
      const g = gpu.length > 0 ? median(gpu) : NaN;
      const row = {
        view: name,
        width,
        height,
        gpuMedianMs: g,
        gpuMinMs: gpu.length > 0 ? Math.min(...gpu) : NaN,
        wallMedianMs: median(r.wallMs),
      };
      rows.push(row);
      console.log(
        `| ${name} | ${width} x ${height} | ${g.toFixed(2)} | ${row.gpuMinMs.toFixed(2)} | ${row.wallMedianMs.toFixed(2)} | ${((width * height) / (g * 1000)).toFixed(0)} |`,
      );
    }
  }
  mkdirSync('artifacts/stage2', { recursive: true });
  writeFileSync(
    'artifacts/stage2/benchmark.json',
    JSON.stringify({ gpu: info, browser: browser?.version(), rows }, null, 2) + '\n',
  );
});
