// Shared by the page specs: a test that fails on any page error or console error (unless a test
// lists the exact messages it expects) and on any request to another origin, plus helpers to
// read the page's debug stats.
import { expect, test as base, type Page } from '@playwright/test';
import type { AppStats } from '../../src/ui/stats.ts';

export { expect };

export const test = base.extend<{ allowConsole: RegExp[]; guard: void }>({
  allowConsole: [[], { option: true }],
  guard: [
    async ({ page, allowConsole, baseURL }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        // Reported with its URL by the response handler below.
        if (text.startsWith('Failed to load resource')) return;
        if (!allowConsole.some((r) => r.test(text))) problems.push(`console error: ${text}`);
      });
      page.on('response', (r) => {
        if (r.status() >= 400) problems.push(`HTTP ${r.status()} for ${r.url()}`);
      });
      const origin = new URL(baseURL ?? 'http://localhost:5179').origin;
      page.on('request', (r) => {
        const u = new URL(r.url());
        if (u.protocol === 'data:' || u.protocol === 'blob:') return;
        if (u.origin !== origin) problems.push(`request to another origin: ${r.url()}`);
      });
      await use();
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

export const stats = (page: Page): Promise<AppStats> =>
  page.evaluate(() => window.photonring!.debug.stats());

/** Waits until the full-quality image is presented and nothing is left to render. */
export async function waitForFullImage(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const s = window.photonring?.debug.stats();
    return s !== undefined && s.state === 'rendering' && s.frames > 0 && s.stage === 'done';
  });
}

/** Opens the page at `path` and waits for the first full image. */
export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await waitForFullImage(page);
}

export const view = (page: Page) => page.getByRole('img', { name: /black hole/i });
