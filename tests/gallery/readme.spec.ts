// Makes the README images that need the browser (not a pass/fail test of the page): G1 and G9,
// CPU renders whose labels are drawn into their pixels by the page's own saved-image composer
// (tests/gallery/compose.html), and the page screenshots P1 to P6 from the running page. Views,
// sizes and caps are in tools/readme-views.ts. Every test is tagged @readme.
// Run with: npx playwright test --project=gallery --grep @readme
// Writes artifacts/stage7/readme/gallery/ and artifacts/stage7/readme/page/ and their
// manifest.json; refuses a file over its cap. Copy approved files with tools/accept-readme.ts.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, release, type } from 'node:os';
import type { Browser, Page } from '@playwright/test';
import { encodeImage, renderImage } from '../../src/cpu-renderer/render.ts';
import { beamMarker } from '../../src/ui/eht-legend.ts';
import { stripDrawing } from '../../src/ui/strip-overlay.ts';
import {
  BUDGET_BYTES,
  galleryHash,
  gallerySettings,
  galleryView,
  MANIFEST,
  mergeManifest,
  OUT,
  PAGE_IDS,
  pageHash,
  pageState,
  type GalleryId,
  type Manifest,
  type ManifestEntry,
  type PageId,
} from '../../tools/readme-views.ts';
import { expect, test } from '../e2e/fixtures.ts';
import { readPng } from '../helpers/png-read.ts';
import type { ComposeRequest } from './compose.ts';

const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const os = `${type()} ${release()} ${arch()}, ${cpus()[0]?.model ?? 'unknown CPU'}`;

/** Checks the cap, writes the file, adds it to its folder's manifest and prints a line. */
function record(
  browser: Browser,
  dir: string,
  png: Buffer,
  e: Pick<ManifestEntry, 'id' | 'file' | 'title' | 'pageHash' | 'settings'>,
  maxBytes: number,
  seconds: number,
): void {
  const sha = sha256(png);
  console.log(
    `${e.id} ${e.file}: ${png.length} bytes, ${seconds.toFixed(1)} s, sha256 ${sha}; ` +
      `page #${e.pageHash}`,
  );
  if (png.length > maxBytes) {
    throw new Error(`${e.id}: ${png.length} bytes, over the cap of ${maxBytes}; not written`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}${e.file}`, png);
  const entry: ManifestEntry = {
    ...e,
    bytes: png.length,
    sha256: sha,
    seconds: Number(seconds.toFixed(1)),
    commit: git('rev-parse', 'HEAD'),
    dirty: git('status', '--porcelain') !== '',
    date: new Date().toISOString(),
    os,
    node: process.version,
    chrome: browser.version(),
  };
  const path = `${dir}${MANIFEST}`;
  const old = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Manifest) : null;
  writeFileSync(path, `${JSON.stringify(mergeManifest(old, [entry]), null, 2)}\n`);
}

/**
 * The composed PNG as base64, from a fresh composer page. A reused dev server may reload the page
 * once after files change (a full reload destroys the evaluation context), so that is retried.
 */
async function compose(page: Page, request: ComposeRequest): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto('/tests/gallery/compose.html');
      await page.waitForFunction(() => window.compose !== undefined);
      return await page.evaluate((r) => window.compose!(r), request);
    } catch (error) {
      if (attempt >= 2 || !String(error).includes('Execution context was destroyed')) throw error;
    }
  }
}

/** RGB pixels at the top left of an opaque black RGBA canvas. */
function onCanvas(rgb: Uint8Array, w: number, h: number, width: number, height: number) {
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 3; p < rgba.length; p += 4) rgba[p] = 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      rgba.set([rgb[i]!, rgb[i + 1]!, rgb[i + 2]!], (y * width + x) * 4);
    }
  }
  return rgba;
}

/** Renders a labelled gallery view on the CPU here, then has the page's composer label it. */
async function labelled(page: Page, browser: Browser, id: GalleryId): Promise<void> {
  const g = galleryView(id);
  const s = gallerySettings(id);
  const labels = g.labels;
  if (!labels) throw new Error(`${id} has no labels: use tools/render-readme.ts`);
  const t0 = performance.now();
  const out = renderImage(s);
  const { stepLimit, nonFinite } = out.stats;
  if (nonFinite > 0) throw new Error(`${id}: ${nonFinite} non-finite samples`);
  if (stepLimit > 0) console.warn(`${id}: ${stepLimit} samples hit the step limit`);
  const rgba = onCanvas(encodeImage(out, s), s.width, s.height, labels.width, labels.height);
  const { distance, elevationDeg } = s.camera;
  const scene = { distance, disk: s.disk !== null };
  const tanHalfFovY = Math.tan((s.camera.fovYDeg * Math.PI) / 360);
  const request: ComposeRequest = {
    width: labels.width,
    height: labels.height,
    scale: labels.scale,
    rgba: Buffer.from(rgba).toString('base64'),
    edge: null,
    rings: [],
    overlays: [],
    view: g.view,
    strip: g.view === 'subrings' ? stripDrawing(distance, elevationDeg) : null,
    labels: scene,
    eht:
      g.view === 'eht'
        ? { ...scene, beam: beamMarker(distance, s.width, s.height, tanHalfFovY) }
        : null,
  };
  const png = Buffer.from(await compose(page, request), 'base64');
  const seconds = (performance.now() - t0) / 1000;
  const decoded = readPng(png);
  expect([decoded.width, decoded.height]).toEqual([labels.width, labels.height]);
  // The labels changed some pixels; the composer leaves the rest as rendered.
  let changed = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const same = [0, 1, 2].every((c) => decoded.rgba[i + c] === rgba[i + c]);
    if (!same) changed++;
  }
  expect(changed).toBeGreaterThan(1000);
  record(
    browser,
    OUT.gallery,
    png,
    {
      id,
      file: g.file,
      title: g.title,
      pageHash: galleryHash(id),
      settings: {
        producer:
          'tests/gallery/readme.spec.ts (CPU reference renderer; labels by composeImage in ' +
          "src/ui/screenshot.ts; PNG from Chrome's canvas encoder)",
        page: g.page,
        render: { width: s.width, height: s.height },
        canvas: { width: labels.width, height: labels.height },
        labelScale: labels.scale,
        shownWidth: labels.shownWidth,
        samplesPerAxis: s.samplesPerAxis,
        mode: s.mode,
        sky: s.sky,
        disk: s.disk !== null,
        camera: s.camera,
        dphi: s.dphi,
        maxSteps: s.maxSteps,
        exposure: s.exposure,
        toneMapping: s.toneMapping,
        stats: out.stats,
        ...(request.eht ? { beam: request.eht.beam } : {}),
      },
    },
    g.maxBytes,
    seconds,
  );
}

test.describe('README gallery images with labels', () => {
  for (const [id, title, timeout] of [
    ['G1', 'EHT-style view, colour ramp, label lines and beam marker', 120_000],
    // About 50 s of CPU rendering on an Apple M5 (1280 x 720, 2 x 2 samples).
    ['G9', 'photon subring strip, axes, order labels, edges, limit and legend', 600_000],
  ] as const) {
    test(`${id}: ${title}`, { tag: '@readme' }, async ({ page, browser }) => {
      test.setTimeout(timeout);
      await labelled(page, browser, id);
    });
  }
});

/**
 * Waits until the page has finished: the full image presented, no brightness change pending, the
 * ring overlays or strip drawn, and the Validation panel's measurement done if it is open. Fails at
 * once if the GPU device is lost.
 */
async function settle(page: Page): Promise<void> {
  const result = await page.waitForFunction(
    () => {
      const s = window.photonring?.debug.stats();
      if (s === undefined) return false;
      if (s.state === 'lost') return 'lost';
      const panel = document.getElementById('validation-panel');
      return s.state === 'rendering' &&
        s.frames > 0 &&
        s.stage === 'done' &&
        !s.brightnessPending &&
        s.ringsState !== 'pending' &&
        (!s.validationOpen || panel?.dataset.state === 'done')
        ? 'done'
        : false;
    },
    undefined,
    { timeout: 60_000 },
  );
  expect(await result.jsonValue()).toBe('done');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function capture(page: Page, browser: Browser, id: PageId): Promise<void> {
  const p = pageState(id);
  const hash = pageHash(id);
  const t0 = performance.now();
  // A fresh page per state: the brightness limiter has no transition to finish.
  await page.goto(`/#${hash}`);
  await settle(page);
  let png: Buffer;
  const c = p.capture;
  if (c.kind === 'page') {
    png = await page.screenshot();
  } else if (c.kind === 'crop') {
    if (c.open) await page.getByRole('button', { name: c.open, exact: true }).click();
    const panel = page.locator(c.selector);
    await expect(panel).toBeVisible();
    await settle(page);
    const shown = panel.getByText(c.mustShow).first();
    const [r, b] = [await shown.boundingBox(), await panel.boundingBox()];
    expect(r, `"${c.mustShow}" in ${c.selector}`).not.toBeNull();
    expect(b).not.toBeNull();
    // Wholly inside the panel's box and the window, so the crop shows it.
    expect(r!.y).toBeGreaterThanOrEqual(b!.y);
    expect(r!.y + r!.height).toBeLessThanOrEqual(b!.y + b!.height);
    await expect(shown).toBeInViewport({ ratio: 1 });
    png = await panel.screenshot();
  } else {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save image' }).click(),
    ]);
    png = readFileSync(await download.path());
  }
  const seconds = (performance.now() - t0) / 1000;
  const stats = await page.evaluate(() => window.photonring!.debug.stats());
  const status = (await page.locator('p.hud').textContent())?.trim() ?? '';
  const adapter = await page.evaluate(async () => {
    const a = await navigator.gpu?.requestAdapter();
    return a ? `${a.info.vendor} ${a.info.architecture}`.trim() : null;
  });
  const decoded = readPng(png);
  record(
    browser,
    OUT.page,
    png,
    {
      id,
      file: p.file,
      title: p.title,
      pageHash: hash,
      settings: {
        producer: 'tests/gallery/readme.spec.ts (the running page in headless Chrome)',
        capture: c,
        viewport: p.viewport,
        deviceScaleFactor: p.deviceScaleFactor,
        image: { width: decoded.width, height: decoded.height },
        internal: { width: stats.internalWidth, height: stats.internalHeight },
        timing: stats.timing,
        adapter,
        status,
      },
    },
    p.maxBytes,
    seconds,
  );
}

for (const id of PAGE_IDS) {
  const p = pageState(id);
  test.describe(`README page screenshot ${id}`, () => {
    test.use({ viewport: p.viewport, deviceScaleFactor: p.deviceScaleFactor });
    test(`${id}: ${p.title}`, { tag: '@readme' }, async ({ page, browser }) => {
      await capture(page, browser, id);
    });
  });
}

test.afterAll(() => {
  const read = (dir: string): Manifest | null =>
    existsSync(`${dir}${MANIFEST}`)
      ? (JSON.parse(readFileSync(`${dir}${MANIFEST}`, 'utf8')) as Manifest)
      : null;
  const gallery = read(OUT.gallery)?.totalBytes ?? 0;
  const shots = read(OUT.page)?.totalBytes ?? 0;
  console.log(
    `README images so far: gallery ${gallery} bytes, page ${shots} bytes, total ` +
      `${gallery + shots} of the ${BUDGET_BYTES} byte budget`,
  );
});
