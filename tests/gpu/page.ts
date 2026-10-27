// Shared by the GPU specs: opening the harness page.
import { expect, type Page } from '@playwright/test';
import type { HarnessInfo } from './harness-api.ts';

/**
 * Opens the harness and waits for the renderer. A reused dev server may reload the page once
 * after files change (a full reload destroys the evaluation context), so that is retried.
 */
export async function openHarness(page: Page): Promise<HarnessInfo> {
  await page.goto('/tests/gpu/harness.html');
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForFunction(() => window.harness !== undefined);
      const info = await page.evaluate(() => window.harness!.ready);
      expect(info.isFallbackAdapter).toBe(false);
      return info;
    } catch (error) {
      if (attempt >= 2 || !String(error).includes('Execution context was destroyed')) throw error;
      await page.waitForLoadState('load');
    }
  }
}
