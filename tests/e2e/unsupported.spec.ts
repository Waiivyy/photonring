// The unsupported-browser path (Stage 4 Playwright list): no WebGPU, no adapter, or no device.
// Each explains why, lists where it works, shows the pre-rendered gallery and the honesty note.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const HONESTY =
  'This is a toy model for learning and demonstration, not a scientific simulation of any real observation.';

async function expectFallback(page: Page, reason: RegExp) {
  await expect(page.getByRole('heading', { name: /WebGPU is not available/i })).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();
  await expect(page.getByText(/Chrome or Edge/)).toBeVisible();
  await expect(page.getByText(/Safari 26/)).toBeVisible();
  await expect(page.getByText(/Firefox/)).toBeVisible();
  await expect(page.getByText(HONESTY, { exact: false })).toBeVisible();
  const images = page.locator('figure img');
  await expect(images).toHaveCount(4);
  for (const img of await images.all()) {
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    expect(await img.getAttribute('alt')).toBeTruthy();
  }
}

test(
  'without WebGPU the page explains why and shows pre-rendered images',
  { tag: '@smoke' },
  async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'gpu', {
        get: () => undefined,
        configurable: true,
      });
    });
    await page.goto('/');
    await expectFallback(page, /does not expose WebGPU/);
  },
);

test('without a suitable adapter the page says so', { tag: '@smoke' }, async ({ page }) => {
  await page.addInitScript(() => {
    const gpu = navigator.gpu;
    if (gpu) Object.defineProperty(gpu, 'requestAdapter', { value: () => Promise.resolve(null) });
  });
  await page.goto('/');
  await expectFallback(page, /no suitable GPU adapter/);
});

test('when the device cannot be created the page says so', { tag: '@smoke' }, async ({ page }) => {
  await page.addInitScript(() => {
    const gpu = navigator.gpu;
    if (!gpu) return;
    const original = gpu.requestAdapter.bind(gpu);
    Object.defineProperty(gpu, 'requestAdapter', {
      value: async (o?: GPURequestAdapterOptions) => {
        const adapter = await original(o);
        if (adapter) {
          Object.defineProperty(adapter, 'requestDevice', {
            value: () => Promise.reject(new Error('device refused for the test')),
          });
        }
        return adapter;
      },
    });
  });
  await page.goto('/');
  await expectFallback(page, /could not be created/);
});

test('a hostile hash on the fallback page causes no error', { tag: '@smoke' }, async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true });
  });
  await page.goto('/#r=NaN&view=<img src=x onerror=alert(1)>&ov=__proto__');
  await expectFallback(page, /does not expose WebGPU/);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
});
