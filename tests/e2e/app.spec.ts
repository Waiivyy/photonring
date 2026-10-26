// App behaviour in headless Chrome (spec section 10, item 14 and the Stage 2 parts of the UI).
import { expect, test, type Page } from '@playwright/test';

interface AppStats {
  state: 'starting' | 'rendering' | 'lost';
  frames: number;
  internalWidth: number;
  internalHeight: number;
  limitedBy: string;
  mode: 'colour' | 'termination';
  azimuthDeg: number;
  distance: number;
  tilesRemaining: number;
}

declare global {
  interface Window {
    photonring?: { debug: { stats(): AppStats; destroyDevice(): void } };
  }
}

const stats = (page: Page) => page.evaluate(() => window.photonring!.debug.stats());

async function waitForFullImage(page: Page) {
  await page.waitForFunction(() => {
    const s = window.photonring?.debug.stats();
    return s !== undefined && s.state === 'rendering' && s.frames > 0 && s.tilesRemaining === 0;
  });
}

test('renders the black hole and finishes every tile', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto('/');
  await waitForFullImage(page);
  const s = await stats(page);
  expect(s.internalWidth).toBeGreaterThan(0);
  expect(s.mode).toBe('colour');
  await page.screenshot({ path: 'artifacts/stage2/e2e-default-view.png' });
});

test('keyboard controls orbit, zoom and toggle the termination view', async ({ page }) => {
  await page.goto('/');
  await waitForFullImage(page);
  const canvas = page.getByRole('img', { name: /black hole/i });
  await canvas.focus();
  const before = await stats(page);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Minus');
  await page.keyboard.press('d');
  const after = await stats(page);
  expect(after.azimuthDeg).not.toBe(before.azimuthDeg);
  expect(after.distance).toBeGreaterThan(before.distance);
  expect(after.mode).toBe('termination');
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

test('without WebGPU the page explains why and shows pre-rendered images', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /WebGPU is not available/i })).toBeVisible();
  await expect(page.getByText(/Chrome/).first()).toBeVisible();
  const images = page.locator('figure img');
  await expect(images).toHaveCount(4);
  for (const img of await images.all()) {
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    expect(await img.getAttribute('alt')).toBeTruthy();
  }
});
