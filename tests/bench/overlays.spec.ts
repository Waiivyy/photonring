// Ring overlay cost (Stage 4). Not a pass/fail test: for the default, close and far views it
// prints the main-thread time spent computing the ring curves after an elevation change, the
// wall-clock time from the end of the settle time and from the key press to the rings being
// drawn, and writes
// artifacts/stage4/overlay-bench.json. Run with npm run bench:gpu.
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

const REPEATS = 7;
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] as number;

test('ring overlay computation by view', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const browser = page.context().browser();
  console.log(
    `${browser?.browserType().name()} ${browser?.version()}, headless, 1920 x 1080, median of ${REPEATS}`,
  );
  console.log(
    '| view | ring compute ms (main thread) | settle to rings drawn ms | key press to rings drawn ms |',
  );
  console.log('|---|---|---|---|');
  const rows = [];
  for (const [name, r, el] of [
    ['default (30 M, 12 deg)', 30, 12],
    ['close (5 M, 20 deg)', 5, 20],
    ['far (200 M, 12 deg)', 200, 12],
  ] as const) {
    await page.goto('about:blank');
    await page.goto(
      `/#v=1&r=${r}&az=0&el=${el}&disk=1&aa=1&view=colour&ov=horizon,photon,isco&val=0`,
    );
    await page.waitForFunction(() => {
      const s = window.photonring?.debug.stats();
      return s?.stage === 'done' && s.ringsState === 'ready';
    });
    await page.getByRole('img', { name: /black hole/i }).focus();
    const compute: number[] = [];
    const latency: number[] = [];
    const wall: number[] = [];
    for (let i = 0; i < REPEATS; i++) {
      // Every press goes to a new elevation, so no curve comes from the cache.
      const t0 = Date.now();
      await page.keyboard.press('ArrowUp');
      await page.waitForFunction(() => window.photonring?.debug.stats().ringsState === 'pending');
      await page.waitForFunction(() => window.photonring?.debug.stats().ringsState === 'ready');
      wall.push(Date.now() - t0);
      const st = await page.evaluate(() => window.photonring!.debug.stats());
      compute.push(st.ringMs);
      latency.push(st.ringLatencyMs);
      await page.waitForFunction(() => window.photonring?.debug.stats().stage === 'done');
    }
    const row = {
      view: name,
      ringMs: median(compute),
      settleToDrawnMs: median(latency),
      pressToDrawnMs: median(wall),
    };
    rows.push(row);
    console.log(
      `| ${name} | ${row.ringMs.toFixed(1)} | ${row.settleToDrawnMs.toFixed(0)} | ${row.pressToDrawnMs} |`,
    );
  }
  mkdirSync('artifacts/stage4', { recursive: true });
  writeFileSync(
    'artifacts/stage4/overlay-bench.json',
    JSON.stringify({ browser: browser?.version(), rows }, null, 2),
  );
});
