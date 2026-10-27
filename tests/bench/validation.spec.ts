// Validation measurement benchmark (Stage 4). Not a pass/fail test: it prints the GPU time of the
// two 1024 x 1024 validation passes, the readback and the classification, and writes
// artifacts/stage4/validation-bench.json. Run with npm run bench:gpu.
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { autoFieldOfView } from '../../src/physics/index.ts';
import { openHarness } from '../gpu/page.ts';

const SIDE = 1024;
const REPEATS = 9;
const median = (v: number[]) => {
  const s = [...v].filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : (s[Math.floor(s.length / 2)] as number);
};
const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '-');

test('validation measurement cost by distance', async ({ page }) => {
  test.setTimeout(600_000);
  const info = await openHarness(page);
  const browser = page.context().browser();
  console.log(
    `GPU ${info.vendor} ${info.architecture}, ${browser?.browserType().name()} ${browser?.version()}, headless, ` +
      `${info.timestampQuery ? 'timestamp queries' : 'wall clock'}, ${SIDE} x ${SIDE}, median of ${REPEATS}`,
  );
  console.log('| distance | colour pass ms | termination pass ms | readback ms | classify ms |');
  console.log('|---|---|---|---|---|');
  const rows = [];
  for (const distance of [5, 30, 200]) {
    const req = {
      distance,
      azimuthDeg: 0,
      elevationDeg: 12,
      fovYDeg: autoFieldOfView(distance, 1, 60),
      side: SIDE,
      timed: true,
    };
    await page.evaluate((r) => window.harness!.measureShadow(r), req); // warm-up
    const colour: number[] = [];
    const termination: number[] = [];
    const readback: number[] = [];
    const classify: number[] = [];
    for (let i = 0; i < REPEATS; i++) {
      const r = await page.evaluate((x) => window.harness!.measureShadow(x), req);
      colour.push(r.gpuMs?.[0] ?? NaN);
      termination.push(r.gpuMs?.[1] ?? NaN);
      readback.push(r.readbackMs ?? NaN);
      classify.push(r.classifyMs);
    }
    const row = {
      distance,
      colourMs: median(colour),
      terminationMs: median(termination),
      readbackMs: median(readback),
      classifyMs: median(classify),
    };
    rows.push(row);
    console.log(
      `| ${distance} M | ${fmt(row.colourMs)} | ${fmt(row.terminationMs)} | ${fmt(row.readbackMs)} | ${fmt(row.classifyMs)} |`,
    );
  }
  mkdirSync('artifacts/stage4', { recursive: true });
  writeFileSync(
    'artifacts/stage4/validation-bench.json',
    JSON.stringify(
      { gpu: info, browser: browser?.version(), side: SIDE, repeats: REPEATS, rows },
      null,
      2,
    ),
  );
});
