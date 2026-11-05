// Benchmark of the photon subring view (Stage 7). Not a pass/fail test: it prints the GPU time of
// the first pass of the strip, whose rays are long near-critical paths, against the colour view of
// the same camera, and writes artifacts/stage7/benchmark-subrings.json. Run with npm run bench:gpu.
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { DEFAULT_DISK, type CameraParams } from '../../src/physics/index.ts';
import type { HarnessImageRequest } from '../gpu/harness-api.ts';
import { openHarness } from '../gpu/page.ts';

const REPEATS = 9;
const resolutions: [number, number][] = [
  [960, 540],
  [1920, 1080],
];
const cameras: Record<string, CameraParams> = {
  'default (30 M, 12 deg)': { distance: 30, azimuthDeg: 0, elevationDeg: 12, fovYDeg: 60 },
  'face-on (30 M, 90 deg)': { distance: 30, azimuthDeg: 0, elevationDeg: 90, fovYDeg: 60 },
};
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] as number;

test('GPU time of the photon subring strip against the colour view', async ({ page }) => {
  test.setTimeout(600_000);
  const info = await openHarness(page);
  const browser = page.context().browser();
  const header =
    `GPU ${info.vendor} ${info.architecture}, ${browser?.browserType().name()} ${browser?.version()}, ` +
    `headless, ${info.timestampQuery ? 'timestamp queries' : 'wall clock'}, median of ${REPEATS}`;
  console.log(header);
  console.log('| view | camera | resolution | first pass ms | preview 1/2 ms | preview 1/4 ms |');
  console.log('|---|---|---|---|---|---|');
  const rows: Record<string, unknown>[] = [];
  for (const [name, camera] of Object.entries(cameras)) {
    for (const [width, height] of resolutions) {
      for (const mode of ['subrings', 'colour'] as const) {
        const request: HarnessImageRequest = {
          width,
          height,
          camera,
          mode,
          sky: mode === 'subrings' ? 'black' : 'stars',
          exposure: 1,
          toneMapping: true,
          disk: DEFAULT_DISK,
          antialias: false,
        };
        const r = await page.evaluate(([req, n]) => window.harness!.benchmark(req, n), [
          request,
          REPEATS,
        ] as const);
        const row = {
          view: mode,
          camera: name,
          width,
          height,
          traceMs: median(r.traceMs),
          previewHalfMs: median(r.previewHalfMs),
          previewQuarterMs: median(r.previewQuarterMs),
        };
        rows.push(row);
        console.log(
          `| ${mode} | ${name} | ${width} x ${height} | ${row.traceMs.toFixed(2)} | ` +
            `${row.previewHalfMs.toFixed(2)} | ${row.previewQuarterMs.toFixed(2)} |`,
        );
      }
    }
  }
  mkdirSync('artifacts/stage7', { recursive: true });
  writeFileSync(
    'artifacts/stage7/benchmark-subrings.json',
    JSON.stringify({ header, date: new Date().toISOString(), repeats: REPEATS, rows }, null, 1),
  );
});
