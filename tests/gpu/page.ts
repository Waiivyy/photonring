// Shared by the GPU specs: opening the harness page.
import { expect, type Page } from '@playwright/test';
import type { RenderSettings } from '../../src/cpu-renderer/render.ts';
import type { HarnessImageRequest, HarnessInfo } from './harness-api.ts';

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

/** A CPU scene's mode and sky as the GPU harness takes them (the shared scenes use no others). */
export function gpuModes(scene: RenderSettings): Pick<HarnessImageRequest, 'mode' | 'sky'> {
  if (scene.mode === 'eht' || scene.sky === 'black') throw new Error('not a GPU scene');
  return { mode: scene.mode, sky: scene.sky };
}
