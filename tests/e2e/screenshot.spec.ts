// Saving the image (Stage 4 screenshot export): the settled full-quality image at internal
// resolution as a PNG made by the browser, with the visible overlays and a legend, named after
// the view it shows, and only once everything visible is complete.
import { readFileSync } from 'node:fs';
import type { Download, Page } from '@playwright/test';
import { readPng, type PngImage } from '../helpers/png-read.ts';
import { legendLayout } from '../../src/ui/legend-layout.ts';
import { expect, openApp, stats, test, view, waitForSettled } from './fixtures.ts';

const full = (patch: string) =>
  `/#v=1&r=30&az=0&el=12&disk=1&aa=1&view=colour&ov=none&val=0${patch ? `&${patch}` : ''}`;

async function save(
  page: Page,
  trigger: () => Promise<void>,
): Promise<{ download: Download; png: PngImage }> {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const png = readPng(readFileSync((await download.path())!));
  return { download, png };
}

async function presented(page: Page): Promise<Uint8Array> {
  const img = await page.evaluate(() => window.photonring!.debug.presentedImage());
  return Uint8Array.from(Buffer.from(img.rgba, 'base64'));
}

const pixel = (rgba: Uint8Array, w: number, x: number, y: number) =>
  [...rgba.subarray(4 * (y * w + x), 4 * (y * w + x) + 3)].join(',');

function sameRegion(a: Uint8Array, b: Uint8Array, w: number, x0: number, y0: number, size: number) {
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) if (pixel(a, w, x, y) !== pixel(b, w, x, y)) return false;
  }
  return true;
}

test('S saves the settled image, named after the view, at the internal resolution', async ({
  page,
}) => {
  await openApp(page);
  await view(page).focus();
  const { download, png } = await save(page, () => page.keyboard.press('s'));
  expect(download.suggestedFilename()).toBe('photonring-r30-az0-el12.png');
  const s = await stats(page);
  expect([png.width, png.height]).toEqual([s.internalWidth, s.internalHeight]);
  const shown = await presented(page);
  expect(Buffer.from(png.rgba).equals(Buffer.from(shown))).toBe(true);
});

test('the Save image button saves too, and visible overlays and their legend are included', async ({
  page,
}) => {
  await openApp(page, full('').replace('ov=none', 'ov=edge'));
  await waitForSettled(page);
  const { png } = await save(page, () => page.getByRole('button', { name: 'Save image' }).click());
  const shown = await presented(page);
  const w = png.width;
  const h = png.height;
  // The edge ellipse is drawn: some of its points differ from the image.
  const s = await stats(page);
  const css = await view(page).evaluate((c) => [c.clientWidth, c.clientHeight] as const);
  const [cx, cy, rx, ry] = await page
    .locator('svg.overlay g[data-overlay="edge"] ellipse.line')
    .evaluate((e) => ['cx', 'cy', 'rx', 'ry'].map((a) => Number(e.getAttribute(a))));
  const k = [s.internalWidth / css[0], s.internalHeight / css[1]];
  let differ = 0;
  for (let i = 0; i < 64; i++) {
    const t = (2 * Math.PI * i) / 64;
    const x = Math.round((cx! + rx! * Math.cos(t)) * k[0]!);
    const y = Math.round((cy! + ry! * Math.sin(t)) * k[1]!);
    if (pixel(png.rgba, w, x, y) !== pixel(shown, w, x, y)) differ++;
  }
  expect(differ).toBeGreaterThan(48);
  // Corners away from the legend are untouched; the legend box is drawn.
  expect(sameRegion(png.rgba, shown, w, 0, 0, 16)).toBe(true);
  expect(sameRegion(png.rgba, shown, w, w - 16, 0, 16)).toBe(true);
  expect(sameRegion(png.rgba, shown, w, 0, h - 16, 16)).toBe(true);
  const box = legendLayout(w, h, [{ label: 'Shadow edge' }], w / css[0])!;
  expect(sameRegion(png.rgba, shown, w, Math.floor(box.x + 2), Math.floor(box.y + 2), 8)).toBe(
    false,
  );
});

test('rings are never missing: a save right after a zoom waits for them', async ({ page }) => {
  await openApp(page, full('').replace('ov=none', 'ov=isco'));
  await waitForSettled(page);
  await view(page).focus();
  await page.keyboard.press('Minus');
  const { png } = await save(page, () => page.keyboard.press('s'));
  const s = await stats(page);
  expect(s.ringsState).toBe('ready');
  expect(s.stage).toBe('done');
  expect(s.distance).toBe(33);
  const shown = await presented(page);
  // Sample vertices of the drawn ISCO path, scaled to internal pixels.
  const d = await page
    .locator('svg.overlay g[data-overlay="isco"] path.line[data-order="0"]')
    .getAttribute('d');
  const css = await view(page).evaluate((c) => [c.clientWidth, c.clientHeight] as const);
  const pts = [...d!.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
  let differ = 0;
  let inside = 0;
  for (const [x, y] of pts.filter((_, i) => i % 10 === 0)) {
    const px = Math.round((x! * s.internalWidth) / css[0]);
    const py = Math.round((y! * s.internalHeight) / css[1]);
    if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
    inside++;
    if (pixel(png.rgba, png.width, px, py) !== pixel(shown, png.width, px, py)) differ++;
  }
  expect(inside).toBeGreaterThan(5);
  expect(differ / inside).toBeGreaterThan(0.8);
});

test('T then S at once: the name and the pixels both show the termination view', async ({
  page,
}) => {
  await openApp(page);
  await view(page).focus();
  await page.keyboard.press('t');
  const { download, png } = await save(page, () => page.keyboard.press('s'));
  expect(download.suggestedFilename()).toBe('photonring-r30-az0-el12-termination.png');
  expect((await stats(page)).mode).toBe('termination');
  const shown = await presented(page);
  const w = png.width;
  const css = await view(page).evaluate((c) => c.clientWidth);
  const box = legendLayout(
    w,
    png.height,
    [{ label: 'Escaped' }, { label: 'Captured' }, { label: 'Step limit' }],
    w / css,
  )!;
  // Outside the legend box the pixels are the presented termination image.
  let mismatched = 0;
  for (let y = 0; y < png.height; y += 7) {
    for (let x = 0; x < w; x += 7) {
      const inBox =
        x >= box.x - 2 &&
        x <= box.x + box.width + 2 &&
        y >= box.y - 2 &&
        y <= box.y + box.height + 2;
      if (!inBox && pixel(png.rgba, w, x, y) !== pixel(shown, w, x, y)) mismatched++;
    }
  }
  expect(mismatched).toBe(0);
  // The legend is drawn in the termination view.
  expect(sameRegion(png.rgba, shown, w, Math.floor(box.x + 2), Math.floor(box.y + 2), 8)).toBe(
    false,
  );
});

test('a save requested during a render arrives once the image is complete', async ({ page }) => {
  await openApp(page, '/?budget=0.5');
  await view(page).focus();
  await page.keyboard.press('ArrowLeft');
  const { png } = await save(page, () => page.keyboard.press('s'));
  const s = await stats(page);
  expect(s.stage).toBe('done');
  expect(s.azimuthDeg).toBe(5);
  expect(Buffer.from(png.rgba).equals(Buffer.from(await presented(page)))).toBe(true);
});

test('holding S saves once, and the save is announced', async ({ page }) => {
  await openApp(page);
  await view(page).focus();
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.keyboard.down('s'); // later downs are auto-repeats
  await page.keyboard.down('s');
  await page.keyboard.down('s');
  await page.keyboard.up('s');
  await page.waitForTimeout(1500);
  expect(downloads).toHaveLength(1);
  await expect(page.locator('#announcer')).toHaveText('Saved photonring-r30-az0-el12.png');
});
