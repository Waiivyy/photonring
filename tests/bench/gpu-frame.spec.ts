// GPU frame-time benchmark (Stage 3). Not a pass/fail test: it prints a table per stage of the
// progressive renderer and writes artifacts/stage3/benchmark.json. Run with npm run bench:gpu.
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { choosePreviewScale } from '../../src/gpu/host/progressive.ts';
import { autoFieldOfView, DEFAULT_DISK } from '../../src/physics/index.ts';
import type { HarnessImageRequest } from '../gpu/harness-api.ts';
import { openHarness } from '../gpu/page.ts';

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
/** The interactive page's frame budget (src/ui/app.ts). */
const BUDGET_MS = 12;
const REPEATS = 9;

const median = (v: number[]) => {
  if (v.length === 0) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
};
const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '-');

test('GPU time per stage by view, disk and resolution', async ({ page }) => {
  test.setTimeout(1_200_000);
  const info = await openHarness(page);
  const browser = page.context().browser();
  const rows: Record<string, unknown>[] = [];
  console.log(
    `GPU ${info.vendor} ${info.architecture}, ${browser?.browserType().name()} ${browser?.version()}, headless, ` +
      `${info.timestampQuery ? 'timestamp queries' : 'wall clock'}, median of ${REPEATS}`,
  );
  console.log(
    '| view | disk | resolution | first pass ms | anti-aliasing ms | refined % | full image ms | preview 1/2 ms | preview 1/4 ms | interactive scale |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const cases: [string, (typeof views)[keyof typeof views], boolean, number | undefined][] = [];
  for (const [name, camera] of Object.entries(views)) {
    for (const disk of [true, false]) cases.push([name, camera, disk, undefined]);
  }
  // For comparison: every pixel refined, which is uniform 3 x 3 supersampling.
  cases.push(['default, uniform 3 x 3', views['default (30 M, 12 deg, fov 60)'], true, -1]);
  for (const [name, camera, disk, aaThreshold] of cases) {
    for (const [width, height] of resolutions) {
      const request: HarnessImageRequest = {
        width,
        height,
        camera,
        mode: 'colour',
        sky: 'stars',
        exposure: 1,
        toneMapping: true,
        disk: disk ? DEFAULT_DISK : null,
        antialias: true,
        ...(aaThreshold === undefined ? {} : { aaThreshold }),
      };
      const r = await page.evaluate(([req, n]) => window.harness!.benchmark(req, n), [
        request,
        REPEATS,
      ] as const);
      const trace = median(r.traceMs);
      const refine = median(r.refineMs);
      const scale = choosePreviewScale(trace / (width * height), width * height, BUDGET_MS);
      const row = {
        view: name,
        disk,
        width,
        height,
        traceMs: trace,
        refineMs: refine,
        refinedFraction: r.refinedFraction,
        fullMs: trace + refine,
        previewHalfMs: median(r.previewHalfMs),
        previewQuarterMs: median(r.previewQuarterMs),
        wallMs: median(r.wallMs),
        interactiveScale: scale,
      };
      rows.push(row);
      console.log(
        `| ${name} | ${disk ? 'on' : 'off'} | ${width} x ${height} | ${fmt(trace)} | ${fmt(refine)} | ` +
          `${(100 * r.refinedFraction).toFixed(1)} | ${fmt(trace + refine)} | ${fmt(row.previewHalfMs)} | ` +
          `${fmt(row.previewQuarterMs)} | ${scale} |`,
      );
    }
  }
  mkdirSync('artifacts/stage3', { recursive: true });
  writeFileSync(
    'artifacts/stage3/benchmark.json',
    JSON.stringify({ gpu: info, browser: browser?.version(), rows }, null, 2) + '\n',
  );
});
