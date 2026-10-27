// App behaviour in headless Chrome (spec section 10, item 14 and the Stage 2 parts of the UI).
import { expect, openApp, stats, test, view, waitForFullImage } from './fixtures.ts';

test('page loads: title, heading, toolbar and a full image', async ({ page }) => {
  const t0 = Date.now();
  await page.goto('/');
  await expect(page).toHaveTitle(/photonring/);
  await expect(page.getByRole('heading', { level: 1, name: 'photonring' })).toBeAttached();
  await expect(page.getByRole('group', { name: 'Tools' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Controls' })).toBeVisible();
  await page.waitForFunction(() => (window.photonring?.debug.stats().frames ?? 0) > 0);
  const firstFrame = Date.now() - t0;
  await waitForFullImage(page);
  // Environment dependent, so logged rather than asserted.
  console.log(`first frame after ${firstFrame} ms, full image after ${Date.now() - t0} ms`);
});

test('renders the black hole and finishes every tile', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto('/');
  await waitForFullImage(page);
  const s = await stats(page);
  expect(s.internalWidth).toBeGreaterThan(0);
  expect(s.mode).toBe('colour');
  await page.screenshot({ path: 'artifacts/stage3/e2e-default-view.png' });
});

test('keyboard controls orbit, zoom and toggle the disk and the termination view', async ({
  page,
}) => {
  await openApp(page);
  await view(page).focus();
  const before = await stats(page);
  expect(before.disk).toBe(true);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Minus');
  await page.keyboard.press('t');
  await page.keyboard.press('d');
  const after = await stats(page);
  expect(after.azimuthDeg).not.toBe(before.azimuthDeg);
  expect(after.distance).toBeGreaterThan(before.distance);
  // Disk and termination view share the brightness limiter, so the second change can arrive up
  // to 500 ms after the first.
  await expect.poll(async () => (await stats(page)).mode).toBe('termination');
  await expect.poll(async () => (await stats(page)).disk).toBe(false);
});

test('a camera move previews at reduced resolution, then refines with anti-aliasing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 540 });
  // A tiny frame budget, so a full-resolution frame never fits and every move is previewed.
  await page.goto('/?budget=0.5');
  await waitForFullImage(page);
  const before = await stats(page);
  expect(before.antialias).toBe(true);
  await view(page).focus();
  await page.keyboard.press('ArrowLeft');
  await waitForFullImage(page);
  const after = await stats(page);
  expect(after.previews).toBeGreaterThan(before.previews);
  expect(after.previewScale).toBeGreaterThanOrEqual(0.25);
  expect(after.previewScale).toBeLessThanOrEqual(0.5);
  expect(after.traceMs).toBeGreaterThan(0);
  expect(after.refineMs).toBeGreaterThan(0);
  expect(after.tilesRemaining).toBe(0);
});

test('A toggles anti-aliasing', async ({ page }) => {
  await page.goto('/');
  await waitForFullImage(page);
  await view(page).focus();
  await page.keyboard.press('a');
  await waitForFullImage(page);
  const s = await stats(page);
  expect(s.antialias).toBe(false);
  expect(s.refineMs).toBe(0);
});

test('after Restart with the keyboard, focus moves to the new view', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.photonring!.debug.destroyDevice());
  const restart = page.getByRole('button', { name: /restart/i });
  await expect(restart).toBeFocused();
  await page.keyboard.press('Enter');
  await waitForFullImage(page);
  await expect(view(page)).toBeFocused();
});

test('a change made just before Restart survives it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.evaluate(() => window.photonring!.debug.destroyDevice());
  await expect(page.getByRole('alert')).toBeVisible();
  // Within the URL's 300 ms debounce.
  await page.getByRole('checkbox', { name: 'Anti-aliasing', exact: true }).click();
  await page.getByRole('button', { name: /restart/i }).click();
  await waitForFullImage(page);
  expect((await stats(page)).antialias).toBe(false);
});

test('device loss shows a recoverable message', async ({ page }) => {
  await page.goto('/');
  await waitForFullImage(page);
  await page.evaluate(() => window.photonring!.debug.destroyDevice());
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(/GPU device was lost/i);
  await page.getByRole('button', { name: /restart/i }).click();
  await waitForFullImage(page);
  expect((await stats(page)).state).toBe('rendering');
});

test('a resolution above the device limit falls back to a smaller internal resolution', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 600 });
  await page.goto('/?maxdim=256');
  await waitForFullImage(page);
  const s = await stats(page);
  expect(s.internalWidth).toBeLessThanOrEqual(256);
  expect(s.internalHeight).toBeLessThanOrEqual(256);
  expect(s.limitedBy).toBe('texture');
});
