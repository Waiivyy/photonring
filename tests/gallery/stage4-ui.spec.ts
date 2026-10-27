// Renders the Stage 4 check-in views of the real page into artifacts/stage4/ (not a pass/fail
// test). Run with npm run gallery:gpu, then open the PNG files.
import { copyFileSync, mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

const OUT = 'artifacts/stage4';
const ALL = 'edge,horizon,photon,isco';
const hash = (o: Record<string, string | number> = {}) => {
  const v = {
    v: 1,
    r: 30,
    az: 0,
    el: 12,
    disk: 1,
    aa: 1,
    view: 'colour',
    ov: 'none',
    val: 0,
    ...o,
  };
  return `/#${Object.entries(v)
    .map(([k, x]) => `${k}=${x}`)
    .join('&')}`;
};

async function settle(page: Page) {
  await page.waitForFunction(() => {
    const s = window.photonring?.debug.stats();
    return (
      s !== undefined &&
      s.stage === 'done' &&
      s.frames > 0 &&
      s.ringsState !== 'pending' &&
      (!s.validationOpen || document.getElementById('validation-panel')?.dataset.state === 'done')
    );
  });
}

/** A fresh load: a hash-only goto would stay in the same document and race the hashchange. */
async function load(page: Page, path: string) {
  await page.goto('about:blank');
  await page.goto(path);
  await settle(page);
}

async function shot(page: Page, path: string, file: string) {
  await load(page, path);
  await page.screenshot({ path: `${OUT}/${file}` });
}

test.describe('Stage 4 page views, 1280 x 720', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

  test('overlays and panels', async ({ page }) => {
    test.setTimeout(300_000);
    await shot(page, hash(), '01-default-ui.png');
    await shot(page, hash({ ov: ALL }), '02-all-overlays-30M.png');
    await shot(page, hash({ ov: ALL, el: 90 }), '03-face-on-overlays.png');
    await shot(page, hash({ ov: ALL, el: 2 }), '04-nearly-edge-on-2deg-overlays.png');
    await shot(page, hash({ ov: ALL, r: 5, el: 20 }), '05-close-5M-overlays.png');
    await shot(page, hash({ ov: ALL, r: 200 }), '06-far-200M-overlays.png');
    await shot(page, hash({ view: 'termination', ov: 'edge' }), '07-termination-view-legend.png');
    await load(page, hash({ ov: 'edge,isco' }));
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await page.screenshot({ path: `${OUT}/08-controls-panel.png` });
    await shot(page, hash({ val: 1 }), '09-validation-panel-30M.png');
    await shot(page, hash({ val: 1, r: 5, el: 20 }), '10-validation-panel-5M.png');
    await load(page, hash());
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.screenshot({ path: `${OUT}/12-about-dialog.png` });
    await load(page, hash({ ov: ALL }));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save image' }).click(),
    ]);
    copyFileSync(await download.path(), `${OUT}/13-saved-image-overlays.png`);
  });
});

test.describe('phone, 390 x 844', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  test('portrait with the Controls sheet', async ({ page }) => {
    await load(page, hash({ ov: 'edge,isco' }));
    await page.getByRole('button', { name: 'Controls', exact: true }).tap();
    await page.screenshot({ path: `${OUT}/11-phone-390x844.png` });
  });
});

test.describe('device pixel ratio 2', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  test('overlays stay sharp and aligned', async ({ page }) => {
    await shot(page, hash({ ov: ALL }), '14-overlays-dpr2.png');
  });
});
