// The photon subring view in the page (docs/DESIGN.md, section 16): reached by key, radio button
// and link through the brightness limiter; the strip with its predicted band edges, labels and
// 32-bit limit; labelled "magnified, logarithmic: not what a camera sees" on screen and in saved
// images; the ring overlays set aside while it is shown.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { readPng } from '../helpers/png-read.ts';
import { legendEntries } from '../../src/ui/legend-entries.ts';
import { legendLayout } from '../../src/ui/legend-layout.ts';
import { expect, openApp, stats, test, view, waitForSettled } from './fixtures.ts';

const hash = (patch: Record<string, string> = {}) => {
  const p = {
    r: '30',
    az: '0',
    el: '12',
    disk: '1',
    aa: '1',
    view: 'subrings',
    ov: 'none',
    val: '0',
    ...patch,
  };
  return `/#v=1&r=${p.r}&az=${p.az}&el=${p.el}&disk=${p.disk}&aa=${p.aa}&view=${p.view}&ov=${p.ov}&val=${p.val}`;
};
const legend = (page: Page) => page.getByRole('list', { name: 'Legend' });
const strip = (page: Page) => page.locator('svg.overlay g[data-overlay="strip"]');

test('a link opens the strip, its predicted edges and its labels', async ({ page }) => {
  await openApp(page, hash({ ov: 'edge,isco' }));
  await waitForSettled(page);
  expect((await stats(page)).mode).toBe('subrings');
  await expect(legend(page)).toContainText('Magnified, logarithmic: not what a camera sees.');
  await expect(legend(page)).toContainText('n = 1 to 2: 23.65');
  await expect(strip(page).locator('path').first()).toBeAttached();
  await expect(strip(page)).toContainText('n = 3');
  await expect(strip(page)).toContainText('32-bit limit');
  // The ring overlays stay in the link but are not drawn over the strip.
  expect((await stats(page)).overlays).toEqual(['edge', 'isco']);
  await expect(page.locator('svg.overlay g[data-overlay="edge"]')).toHaveCount(0);
  await expect(view(page)).toHaveAccessibleName(/^Black hole photon subrings: magnified strip/);
});

test('N switches to the strip and back through the brightness limiter, and the radio does too', async ({
  page,
}) => {
  await openApp(page, hash({ view: 'colour' }));
  await view(page).focus();
  await page.keyboard.press('n');
  await expect.poll(async () => (await stats(page)).mode).toBe('subrings');
  await page.keyboard.press('n');
  await expect.poll(async () => (await stats(page)).mode).toBe('colour');
  const times = (await stats(page)).toggleApplyTimes.slice(-2);
  expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(500);
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.getByRole('radio', { name: 'Photon subrings (magnified)', exact: true }).check();
  await expect.poll(async () => (await stats(page)).mode).toBe('subrings');
});

test('with the disk off the strip is black and says how to see the bands', async ({ page }) => {
  await openApp(page, hash({ disk: '0' }));
  await expect(legend(page)).toContainText('Disk off: turn it on (D) to see its images.');
});

test('a saved strip is named -subrings and carries its lines, labels and legend', async ({
  page,
}) => {
  await openApp(page, hash());
  await waitForSettled(page);
  await view(page).focus();
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('s')]);
  expect(download.suggestedFilename()).toBe('photonring-r30-az0-el12-subrings.png');
  const png = readPng(readFileSync(await download.path()));
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
    legendEntries([], 'subrings', { distance: 30, disk: true }),
    w / css,
  )!;
  let inBox = 0;
  let outside = 0;
  for (let y = 0; y < png.height; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const i = 4 * (y * w + x);
      const differs =
        png.rgba[i] !== shown[i] ||
        png.rgba[i + 1] !== shown[i + 1] ||
        png.rgba[i + 2] !== shown[i + 2];
      if (!differs) continue;
      if (x >= box.x && y >= box.y) inBox++;
      else outside++;
    }
  }
  // The legend box, and the strip's lines and labels elsewhere in the image.
  expect(inBox).toBeGreaterThan(100);
  expect(outside).toBeGreaterThan(500);
});

test('the Validation panel measures the shadow of the current camera in this view', async ({
  page,
}) => {
  await openApp(page, hash({ val: '1' }));
  const panel = page.getByRole('region', { name: 'Validation: shadow size' });
  await expect(panel).toHaveAttribute('data-state', 'done');
  await expect(panel).toContainText('Within tolerance');
  expect((await page.evaluate(() => window.photonring!.debug.validation()))?.pass).toBe(true);
});

test("returning to an earlier camera shows that camera's edges again, not the last one drawn", async ({
  page,
}) => {
  await openApp(page, hash());
  await waitForSettled(page);
  const paths = () =>
    strip(page)
      .locator('path')
      .evaluateAll((ps) => ps.map((p) => p.getAttribute('d')).join('|'));
  const first = await paths();
  await view(page).focus();
  await page.keyboard.press('ArrowUp');
  await waitForSettled(page);
  const other = await paths();
  expect(other).not.toBe(first);
  await page.keyboard.press('ArrowDown');
  await waitForSettled(page);
  expect(await paths()).toBe(first);
});

test('on a small screen with a panel open the legend keeps its key line clear of the toolbar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openApp(page, hash({ val: '1' }));
  const key = legend(page).getByText('not what a camera sees', { exact: false });
  await expect(key).toBeVisible();
  const toolbar = await page.locator('.toolbar').boundingBox();
  const line = await key.boundingBox();
  expect(line!.y).toBeGreaterThan(toolbar!.y + toolbar!.height);
});
