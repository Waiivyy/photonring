// The EHT-style view in the page (docs/DESIGN.md, section 16): reached by key, radio button,
// link and preset, every change through the brightness limiter; labelled as false colour and
// "not a simulation of the EHT observation" on screen and in saved images; measured by the
// Validation panel like any view.
import { readFileSync } from 'node:fs';
import type { Download, Page } from '@playwright/test';
import { readPng, type PngImage } from '../helpers/png-read.ts';
import { legendEntries } from '../../src/ui/legend-entries.ts';
import { legendLayout } from '../../src/ui/legend-layout.ts';
import { beamMarker } from '../../src/ui/eht-legend.ts';
import { expect, openApp, stats, test, view, waitForFullImage } from './fixtures.ts';

const hash = (patch: Record<string, string> = {}) => {
  const p = {
    r: '30',
    az: '0',
    el: '12',
    disk: '1',
    aa: '1',
    view: 'colour',
    ov: 'none',
    val: '0',
    ...patch,
  };
  return `/#v=1&r=${p.r}&az=${p.az}&el=${p.el}&disk=${p.disk}&aa=${p.aa}&view=${p.view}&ov=${p.ov}&val=${p.val}`;
};
const legend = (page: Page) => page.getByRole('list', { name: 'Legend' });

async function save(
  page: Page,
  trigger: () => Promise<void>,
): Promise<{ download: Download; png: PngImage }> {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return { download, png: readPng(readFileSync(await download.path())) };
}

test(
  'a link to the EHT-style view opens it, labelled false colour and not a simulation',
  { tag: '@smoke' },
  async ({ page }) => {
    await openApp(page, hash({ view: 'eht' }));
    expect((await stats(page)).mode).toBe('eht');
    await expect(legend(page)).toContainText('False colour');
    await expect(legend(page)).toContainText('Not a simulation of the EHT observation');
    await expect(legend(page)).toContainText('north is up');
    await expect(view(page)).toHaveAccessibleName(/EHT-style view, false colour/);
  },
);

test('B switches to the EHT-style view and back, each change through the brightness limiter', async ({
  page,
}) => {
  await openApp(page);
  await view(page).focus();
  await page.keyboard.press('b');
  await expect.poll(async () => (await stats(page)).mode).toBe('eht');
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('view=eht');
  await page.keyboard.press('b');
  await expect.poll(async () => (await stats(page)).mode).toBe('colour');
  const times = (await stats(page)).toggleApplyTimes.slice(-2);
  expect(times).toHaveLength(2);
  expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(500);
});

test('the radio button and the preset in the Controls panel', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  const radio = page.getByRole('radio', { name: 'EHT-style (false colour)', exact: true });
  await radio.check();
  await expect.poll(async () => (await stats(page)).mode).toBe('eht');
  await page.getByRole('radio', { name: 'Colour', exact: true }).check();
  await expect.poll(async () => (await stats(page)).mode).toBe('colour');
  const before = (await stats(page)).toggleApplies;
  await page.getByRole('button', { name: 'Tilt 17°, as for M87*' }).click();
  await expect.poll(async () => (await stats(page)).mode).toBe('eht');
  const s = await stats(page);
  expect([s.distance, s.azimuthDeg, s.elevationDeg]).toEqual([200, 0, -73]);
  expect(s.disk).toBe(true);
  // Camera, view and disk change together: one brightness change.
  await expect.poll(async () => (await stats(page)).brightnessPending).toBe(false);
  expect((await stats(page)).toggleApplies).toBe(before + 1);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('r=200&az=0&el=-73');
  await expect(radio).toBeChecked();
});

test('with the disk off the view is black and says why', async ({ page }) => {
  await openApp(page, hash({ view: 'eht', disk: '0' }));
  await expect(legend(page)).toContainText('Disk off: nothing emits in this view.');
  const img = await page.evaluate(() => window.photonring!.debug.presentedImage());
  const rgba = Buffer.from(img.rgba, 'base64');
  let lit = 0;
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i]! + rgba[i + 1]! + rgba[i + 2]! > 0) lit++;
  expect(lit).toBe(0);
});

test('a saved image is named -eht and carries the labels and the beam marker', async ({ page }) => {
  await openApp(page, hash({ view: 'eht', r: '200', el: '-73' }));
  await waitForFullImage(page);
  await view(page).focus();
  const { download, png } = await save(page, () => page.keyboard.press('s'));
  expect(download.suggestedFilename()).toBe('photonring-r200-az0-el-73-eht.png');
  const s = await stats(page);
  expect([png.width, png.height]).toEqual([s.internalWidth, s.internalHeight]);
  const shown = Buffer.from(
    (await page.evaluate(() => window.photonring!.debug.presentedImage())).rgba,
    'base64',
  );
  const css = await view(page).evaluate((c) => c.clientWidth);
  const w = png.width;
  const box = legendLayout(
    w,
    png.height,
    legendEntries([], 'eht', { distance: 200, disk: true }),
    w / css,
  )!;
  const beam = beamMarker(200, w, png.height, Math.tan((s.fovYDeg * Math.PI) / 360))!;
  const differs = (x: number, y: number) => {
    const i = 4 * (y * w + x);
    return (
      png.rgba[i] !== shown[i] ||
      png.rgba[i + 1] !== shown[i + 1] ||
      png.rgba[i + 2] !== shown[i + 2]
    );
  };
  // The legend box is drawn over the image; on the beam circle's rightmost point too.
  let inBox = 0;
  for (let y = Math.ceil(box.y); y < box.y + box.height; y += 4) {
    for (let x = Math.ceil(box.x); x < box.x + box.width; x += 4) if (differs(x, y)) inBox++;
  }
  expect(inBox).toBeGreaterThan(100);
  expect(differs(Math.round(beam.cx + beam.r), Math.round(beam.cy))).toBe(true);
  // Elsewhere (away from the legend, the beam and its label) the pixels are the presented image.
  let elsewhere = 0;
  for (let y = 0; y < png.height; y += 11) {
    for (let x = 0; x < w; x += 11) {
      const nearBox = x >= box.x - 3 && y >= box.y - 3;
      const nearBeam = Math.hypot(x - beam.cx, y - beam.cy) < beam.r + 40 * (w / css);
      if (!nearBox && !nearBeam && differs(x, y)) elsewhere++;
    }
  }
  expect(elsewhere).toBe(0);
});

test('the Validation panel measures the shadow of the current camera in this view', async ({
  page,
}) => {
  await openApp(page, hash({ view: 'eht', r: '200', el: '-73', val: '1' }));
  const panel = page.getByRole('region', { name: 'Validation: shadow size' });
  await expect(panel).toHaveAttribute('data-state', 'done');
  await expect(panel).toContainText('Within tolerance');
  await expect(panel).toContainText("does not use the view's blur or colours");
  const result = await page.evaluate(() => window.photonring!.debug.validation());
  expect(result?.pass).toBe(true);
});

test('in portrait the ring is framed for the narrow side, as the overlays assume', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, hash({ view: 'eht', r: '200', el: '-73' }));
  const s = await stats(page);
  const img = await page.evaluate(() => window.photonring!.debug.presentedImage());
  const rgba = Buffer.from(img.rgba, 'base64');
  const w = img.width;
  const h = img.height;
  // The brightest pixel lies on the ring, about 11 M from the centre; 28 M fits half the width.
  let best = 0;
  for (let p = 1; p < w * h; p++) {
    const v = (q: number) => rgba[4 * q]! + rgba[4 * q + 1]! + rgba[4 * q + 2]!;
    if (v(p) > v(best)) best = p;
  }
  const dx = (best % w) + 0.5 - w / 2;
  const dy = Math.floor(best / w) + 0.5 - h / 2;
  const radiusM = (Math.hypot(dx, dy) * 56) / Math.min(w, h);
  expect(s.internalWidth).toBeLessThan(s.internalHeight);
  expect(radiusM).toBeGreaterThan(8);
  expect(radiusM).toBeLessThan(14);
});

test('on a small screen with a panel open the legend keeps its key line clear of the toolbar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openApp(page, hash({ view: 'eht', r: '200', el: '-73', val: '1' }));
  const key = legend(page).getByText('Not a simulation of the EHT observation', { exact: false });
  await expect(key).toBeVisible();
  const toolbar = await page.locator('.toolbar').boundingBox();
  const line = await key.boundingBox();
  expect(line!.y).toBeGreaterThan(toolbar!.y + toolbar!.height);
});
