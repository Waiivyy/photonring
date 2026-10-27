// Touch controls (Stage 4) on a phone-sized touch screen: one finger orbits, two fingers zoom,
// every control is a large enough target, and the panels become bottom sheets.
import type { CDPSession, Page } from '@playwright/test';
import { expect, openApp, stats, test } from './fixtures.ts';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  points: [number, number][],
) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(([x, y], id) => ({ x, y, id })),
  });
}

async function drag(page: Page, from: [number, number][], to: [number, number][], steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, 'touchStart', from);
  for (let k = 1; k <= steps; k++) {
    const p = from.map(([x, y], i) => {
      const [tx, ty] = to[i]!;
      return [x + ((tx - x) * k) / steps, y + ((ty - y) * k) / steps] as [number, number];
    });
    await touch(cdp, 'touchMove', p);
  }
  await touch(cdp, 'touchEnd', []);
  await cdp.detach();
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('one finger orbits', async ({ page }) => {
  const before = await stats(page);
  await drag(page, [[200, 400]], [[120, 460]]);
  const after = await stats(page);
  expect(after.azimuthDeg).not.toBe(before.azimuthDeg);
  expect(after.elevationDeg).not.toBe(before.elevationDeg);
});

test('two fingers spreading apart zoom in, within the limits', async ({ page }) => {
  await drag(
    page,
    [
      [180, 420],
      [210, 420],
    ],
    [
      [60, 420],
      [330, 420],
    ],
  );
  const s = await stats(page);
  expect(s.distance).toBeLessThan(30);
  expect(s.distance).toBeGreaterThanOrEqual(5);
});

test('tapping Zoom in zooms, a single-pointer alternative to the pinch', async ({ page }) => {
  await page.getByRole('button', { name: 'Controls', exact: true }).tap();
  await page.getByRole('button', { name: 'Zoom in' }).tap();
  expect((await stats(page)).distance).toBe(27.273);
});

test('every control is at least 44 x 44 CSS px', async ({ page }) => {
  await page.getByRole('button', { name: 'Controls', exact: true }).tap();
  const targets = page.locator(
    '.toolbar button:visible, .panel button:visible, .panel label:visible',
  );
  const n = await targets.count();
  expect(n).toBeGreaterThan(10);
  for (let i = 0; i < n; i++) {
    const box = await targets.nth(i).boundingBox();
    const name = await targets.nth(i).textContent();
    expect(box, name ?? '').not.toBeNull();
    expect(box!.width, name ?? '').toBeGreaterThanOrEqual(44);
    expect(box!.height, name ?? '').toBeGreaterThanOrEqual(44);
  }
});

test('on a narrow screen the panel is a bottom sheet and the page keeps pinch zoom', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Controls', exact: true }).tap();
  const panel = page.getByRole('region', { name: 'Controls' });
  const box = (await panel.boundingBox())!;
  expect(Math.abs(box.y + box.height - 844)).toBeLessThan(2);
  expect(box.height).toBeLessThanOrEqual(844 / 2 + 1);
  const touchAction = await panel.evaluate((e) => getComputedStyle(e).touchAction);
  expect(touchAction).toContain('pinch-zoom');
});

test('no horizontal scrolling inside the open sheet at 320 CSS px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole('button', { name: 'Controls', exact: true }).tap();
  const panel = page.locator('#controls-panel');
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
