// Offline behaviour of the built page (brief section 10, item 15; Stage 5): served at a path
// like the GitHub Pages project site, it requests nothing but same-origin files that exist in
// dist/, on the WebGPU path and on the unsupported path; after load, only the favicon (which
// Chrome fetches by itself, and again after every change of the hash) and, on the fallback page,
// the gallery images. The CSP is checked to be the one in tools/csp.ts, and a control test shows
// that the recorder and the policy catch what they must. Run with npm run test:dist.
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { CSP_POLICY } from '../../tools/csp.ts';

const DIST = new URL('../../dist/', import.meta.url);
/** Files in dist/, relative and with forward slashes; read in beforeAll (dist/ is built by the
 * webServer, which does not run when tests are only listed). */
let FILES = new Set<string>();

test.beforeAll(() => {
  const root = fileURLToPath(DIST);
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : [relative(root, join(d, e.name)).split(sep).join('/')],
    );
  FILES = new Set(walk(root));
});

interface Seen {
  readonly path: string;
  readonly afterLoad: boolean;
}

/** Records every request and every way the page could reach the network or break the policy. */
async function record(page: Page, context: BrowserContext, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const basePath = new URL(baseURL).pathname;
  const seen: Seen[] = [];
  const problems: string[] = [];
  let loaded = false;
  // A request the policy blocks may never reach the network layer: only this event shows it.
  await page.addInitScript(() => {
    const w = window as unknown as { violations: string[] };
    w.violations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.violations.push(`${e.effectiveDirective} ${e.blockedURI}`),
    );
  });
  page.on('load', () => (loaded = true));
  // Context level: requests from the page, workers and service workers.
  context.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'blob:') {
      if (u.origin !== origin) problems.push(`blob from another origin: ${r.url()}`);
      return;
    }
    if (u.origin !== origin) return void problems.push(`request to another origin: ${r.url()}`);
    if (r.method() !== 'GET') problems.push(`${r.method()} ${r.url()}`);
    if (!u.pathname.startsWith(basePath)) {
      return void problems.push(`request outside the site: ${r.url()}`);
    }
    const path = decodeURIComponent(u.pathname).slice(basePath.length);
    seen.push({ path: `/${path}`, afterLoad: loaded });
    if (!(path === '' && r.isNavigationRequest()) && !FILES.has(path)) {
      problems.push(`request for a file that is not in dist: ${r.url()}`);
    }
  });
  context.on('requestfailed', (r) =>
    problems.push(`request failed: ${r.url()} (${r.failure()?.errorText ?? 'unknown'})`),
  );
  context.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()} for ${r.url()}`);
  });
  page.on('websocket', (w) => problems.push(`WebSocket ${w.url()}`));
  page.on('worker', (w) => problems.push(`worker ${w.url()}`));
  context.on('serviceworker', (w) => problems.push(`service worker ${w.url()}`));
  page.on('download', (d) => {
    if (!d.url().startsWith(`blob:${origin}/`)) problems.push(`download from ${d.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  const violations = () =>
    page.evaluate(() => (window as unknown as { violations: string[] }).violations);
  return { seen, problems, violations };
}

type Recorder = Awaited<ReturnType<typeof record>>;

async function expectClean(page: Page, rec: Recorder) {
  expect(await rec.violations()).toEqual([]);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  expect(rec.problems).toEqual([]);
}

const paths = (seen: readonly Seen[], afterLoadOnly = false) =>
  [...new Set(seen.filter((s) => !afterLoadOnly || s.afterLoad).map((s) => s.path))].sort();

const HASHED = /^\/assets\/[\w.-]+-[\w-]{8}\.(js|css|png)$/;

test('WebGPU path: load, change the view, open every panel and save the image', async ({
  page,
  context,
  baseURL,
}) => {
  const rec = await record(page, context, baseURL!);
  await page.goto('./');
  const result = await page.waitForFunction(() => {
    const s = window.photonring?.debug.stats();
    if (s?.state === 'lost') return 'lost';
    return s !== undefined && s.state === 'rendering' && s.frames > 0 && s.stage === 'done';
  });
  if ((await result.jsonValue()) === 'lost') {
    throw new Error(`GPU device lost: ${(await page.getByRole('alert').locator('p').textContent())?.trim()}`);
  }
  expect(
    await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),
  ).toBe(CSP_POLICY);
  await page.getByRole('img', { name: /black hole/i }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Shadow edge', exact: true }).check();
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.getByRole('button', { name: 'Validation', exact: true }).click();
  await expect(page.locator('#validation-panel')).toHaveAttribute('data-state', 'done');
  await page.getByRole('button', { name: 'Validation', exact: true }).click();
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await page.keyboard.press('Escape');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save image' }).click(),
  ]);
  expect(download.url().startsWith(`blob:${new URL(baseURL!).origin}/`)).toBe(true);
  // The only way to see that nothing more arrives is to wait.
  await page.waitForTimeout(1500);
  const all = paths(rec.seen);
  const js = all.filter((p) => /^\/assets\/.*\.js$/.test(p));
  const css = all.filter((p) => /^\/assets\/.*\.css$/.test(p));
  expect(js).toHaveLength(1);
  expect(css).toHaveLength(1);
  for (const p of [...js, ...css]) expect(p).toMatch(HASHED);
  // The favicon is allowed, never required: whether Chrome fetches it varies by version.
  expect(all.filter((p) => p !== '/favicon.svg')).toEqual(['/', ...css, ...js].sort());
  expect(paths(rec.seen, true).filter((p) => p !== '/favicon.svg')).toEqual([]);
  test.info().annotations.push({ type: 'favicon', description: String(all.includes('/favicon.svg')) });
  await expectClean(page, rec);
});

test('unsupported path: the hashed gallery images are the only other files', async ({
  page,
  context,
  baseURL,
}) => {
  const rec = await record(page, context, baseURL!);
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true });
  });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /WebGPU is not available/i })).toBeVisible();
  await page.mouse.wheel(0, 5000);
  for (const img of await page.locator('figure img').all()) {
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
  }
  await page.waitForTimeout(1000);
  const all = paths(rec.seen).filter((p) => p !== '/favicon.svg');
  const pngs = all.filter((p) => p.endsWith('.png'));
  expect(pngs).toHaveLength(4);
  for (const p of all.filter((x) => x !== '/')) expect(p).toMatch(HASHED);
  expect(all.filter((p) => !/\.(js|css|png)$/.test(p))).toEqual(['/']);
  // Images may start just before or just after load; nothing else may follow load.
  const after = paths(rec.seen, true).filter((p) => p !== '/favicon.svg' && !p.endsWith('.png'));
  expect(after).toEqual([]);
  await expectClean(page, rec);
});

test('control: the recorder and the policy catch requests the page must never make', async ({
  page,
  context,
  baseURL,
}) => {
  const rec = await record(page, context, baseURL!);
  await page.goto('./');
  await page.waitForFunction(() => (window.photonring?.debug.stats().frames ?? 0) > 0);
  await page.evaluate(async () => {
    await fetch('https://example.com/telemetry').catch(() => undefined);
    navigator.sendBeacon('https://example.com/b', 'x');
    await fetch('./missing.json').catch(() => undefined);
    for (const src of ['https://example.com/p.png', 'data:image/png;base64,iVBORw0KGgo=']) {
      const img = document.createElement('img');
      img.src = src;
      document.body.append(img);
    }
    // The policy allows these two, so only the recorder can catch them: a same-origin file that
    // is not in dist/, and a navigation to another origin (which the resolver rule stops).
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './missing.css';
    document.head.append(link);
    window.open('https://example.com/x', '_blank');
    await new Promise((r) => setTimeout(r, 1000));
  });
  const v = await rec.violations();
  // Without the policy the fetches would be requests; with it they are blocked before that.
  expect(v.filter((x) => x.startsWith('connect-src'))).toHaveLength(3);
  expect(v.filter((x) => x.startsWith('img-src'))).toHaveLength(2);
  expect(rec.problems.some((p) => p.startsWith('console error'))).toBe(true);
  const missing = new URL('missing.css', baseURL).href;
  expect(rec.problems).toEqual(
    expect.arrayContaining([
      `request for a file that is not in dist: ${missing}`,
      `HTTP 404 for ${missing}`,
      'request to another origin: https://example.com/x',
      'request failed: https://example.com/x (net::ERR_NAME_NOT_RESOLVED)',
    ]),
  );
});
