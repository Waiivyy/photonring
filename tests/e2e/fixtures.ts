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
      const failedUrls = new Set<string>();
      page.on('response', (r) => {
        if (r.status() >= 400) {
          failedUrls.add(r.url());
          problems.push(`HTTP ${r.status()} for ${r.url()}`);
        }
      });
      page.on('requestfailed', (r) => {
        failedUrls.add(r.url());
        problems.push(`request failed: ${r.url()} (${r.failure()?.errorText ?? 'unknown'})`);
      });
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        // Already reported, with its URL, by the handlers above; anything else (such as a load
        // the browser makes on its own) is reported here.
        if (text.startsWith('Failed to load resource') && failedUrls.has(m.location().url)) return;
        if (!allowConsole.some((r) => r.test(text))) {
          problems.push(`console error: ${text} (${m.location().url})`);
        }
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

/**
 * Waits until the full-quality image is presented and nothing is left to render. Fails at once,
 * with the page's message, if the GPU device is lost first. (A restart removes the old page's
 * debug hook, so after Restart this waits for the new one.)
 */
export async function waitForFullImage(page: Page): Promise<void> {
  const result = await page.waitForFunction(() => {
    const s = window.photonring?.debug.stats();
    if (s === undefined) return false;
    if (s.state === 'lost') return 'lost';
    return s.state === 'rendering' && s.frames > 0 && s.stage === 'done' ? 'done' : false;
  });
  if ((await result.jsonValue()) === 'lost') {
    const alert = (await page.getByRole('alert').locator('p').textContent()) ?? '';
    throw new Error(`The GPU device was lost before the image was complete: ${alert.trim()}`);
  }
}

/** Opens the page at `path` and waits for the first full image. */
export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await waitForFullImage(page);
}

export const view = (page: Page) => page.getByRole('img', { name: /black hole/i });

/** Waits for the full image and for any ring overlays to be drawn for it. */
export async function waitForSettled(page: Page): Promise<void> {
  await waitForFullImage(page);
  await page.waitForFunction(() => window.photonring?.debug.stats().ringsState !== 'pending');
}
