// Overlays in the page (Stage 4): toggles by key and checkbox, the shadow edge drawn exactly at
// the analytic radius, constant line width, the compact legend, rings hidden while the view
// changes, and no extra GPU frames.
import type { Page } from '@playwright/test';
import { shadowAngularRadius } from '../../src/physics/index.ts';
import { expect, openApp, stats, test, view, waitForFullImage } from './fixtures.ts';

const group = (page: Page, id: string) => page.locator(`svg.overlay g[data-overlay="${id}"]`);
const canonical = (r: number, extra = '') =>
  `/#v=1&r=${r}&az=0&el=12&disk=1&aa=1&view=colour&ov=${extra || 'none'}&val=0`;

test('E, H, P and I and the checkboxes toggle the overlays, in sync', async ({ page }) => {
  await openApp(page);
  await view(page).focus();
  for (const [key, id, name] of [
    ['e', 'edge', 'Shadow edge'],
    ['h', 'horizon', 'Horizon ring'],
    ['p', 'photon', 'Photon sphere ring'],
    ['i', 'isco', 'ISCO ring'],
  ] as const) {
    await expect(group(page, id)).toHaveCount(0);
    await page.keyboard.press(key);
    await expect(group(page, id)).toHaveCount(1);
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    const box = page.getByRole('checkbox', { name, exact: true });
    await expect(box).toBeChecked();
    await box.click();
    await expect(group(page, id)).toHaveCount(0);
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await view(page).focus();
  }
});

for (const r of [5, 30, 200]) {
  test(`the shadow edge is drawn at the analytic radius, ${r} M`, async ({ page }) => {
    await openApp(page, canonical(r, 'edge'));
    const s = await stats(page);
    const line = group(page, 'edge').locator('ellipse.line');
    const [rx, ry, width] = await line.evaluate((e) => [
      Number(e.getAttribute('rx')),
      Number(e.getAttribute('ry')),
      Number(e.getAttribute('stroke-width')),
    ]);
    const css = await view(page).evaluate((c) => [c.clientWidth, c.clientHeight]);
    const t = Math.tan((s.fovYDeg * Math.PI) / 360);
    const tanPsi = Math.tan(shadowAngularRadius(s.distance, 1));
    const aspect = s.internalWidth / s.internalHeight;
    expect(Math.abs(ry - ((css[1]! / 2) * tanPsi) / t)).toBeLessThan(0.01);
    expect(Math.abs(rx - ((css[0]! / 2) * tanPsi) / (aspect * t))).toBeLessThan(0.01);
    expect(width).toBe(1.5);
  });
}

test('the compact legend lists the enabled overlays, and the key of the termination view', async ({
  page,
}) => {
  await openApp(page, canonical(30, 'edge,isco'));
  const legend = page.getByRole('list', { name: 'Legend' });
  await expect(legend).toBeVisible();
  await expect(legend.getByRole('listitem')).toHaveText(['Shadow edge', 'ISCO ring']);
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(legend).toBeHidden();
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.evaluate(() => (location.hash = '#v=1&view=termination'));
  await expect(legend.getByRole('listitem')).toHaveText(['Escaped', 'Captured', 'Step limit']);
  await page.evaluate(() => (location.hash = '#v=1'));
  await expect(legend).toBeHidden();
});

test('ring curves are hidden while the elevation changes and drawn once it settles', async ({
  page,
}) => {
  await openApp(page, canonical(30, 'isco'));
  await expect(group(page, 'isco')).toHaveAttribute('data-state', 'ready');
  expect((await stats(page)).ringsState).toBe('ready');
  await view(page).focus();
  await page.keyboard.press('ArrowUp');
  await expect(group(page, 'isco')).toHaveAttribute('data-state', 'pending');
  await expect(group(page, 'isco').locator('path')).toHaveCount(0);
  await expect(group(page, 'isco')).toHaveAttribute('data-state', 'ready');
  await expect(group(page, 'isco').locator('path.line')).toHaveCount(2);
  expect((await stats(page)).ringMs).toBeGreaterThan(0);
  // An azimuth change keeps the curves (they do not depend on it): the group never goes back to
  // pending and its paths are the same nodes, not recomputed ones.
  await waitForFullImage(page);
  await group(page, 'isco').evaluate((g) => {
    const w = window as unknown as { seen: string[]; firstPath: Element | null };
    w.seen = [];
    w.firstPath = g.querySelector('path.line');
    new MutationObserver(() => w.seen.push(g.getAttribute('data-state') ?? '')).observe(g, {
      attributes: true,
      childList: true,
    });
  });
  await page.keyboard.press('ArrowLeft');
  await waitForFullImage(page);
  const unchanged = await group(page, 'isco').evaluate((g) => {
    const w = window as unknown as { seen: string[]; firstPath: Element | null };
    return { seen: w.seen, same: g.querySelector('path.line') === w.firstPath };
  });
  expect(unchanged.seen).not.toContain('pending');
  expect(unchanged.same).toBe(true);
  expect((await stats(page)).azimuthDeg).toBe(5);
});

test('toggling overlays renders no new GPU frame', async ({ page }) => {
  await openApp(page);
  const before = (await stats(page)).frames;
  await view(page).focus();
  for (const k of ['e', 'h', 'p', 'i', 'e', 'h', 'p', 'i']) await page.keyboard.press(k);
  await page.waitForTimeout(300);
  expect((await stats(page)).frames).toBe(before);
});

test('overlays are part of the shared link', async ({ page }) => {
  await openApp(page);
  await view(page).focus();
  await page.keyboard.press('i');
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('ov=edge,isco');
  await page.reload();
  await waitForFullImage(page);
  await expect(group(page, 'edge')).toHaveCount(1);
  await expect(group(page, 'isco')).toHaveCount(1);
});
