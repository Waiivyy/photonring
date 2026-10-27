// The overlay lines sit on the rendered pixels (Stage 4; spec section 10, item 9): in the
// termination view without anti-aliasing, every pixel more than 1 internal px inside the drawn
// shadow edge is captured, and every pixel more than 1 px outside it escaped, at device pixel
// ratios 1, 2 and 3, in portrait, and with a capped texture size that changes the aspect.
// Views stay where the f32 band at the edge is well under a pixel (10 to 100 M).
import type { Page } from '@playwright/test';
import { expect, openApp, stats, test, view } from './fixtures.ts';

async function checkAlignment(page: Page, path: string) {
  await openApp(page, path);
  const s = await stats(page);
  const css = await view(page).evaluate((c) => [c.clientWidth, c.clientHeight] as const);
  const sx = s.internalWidth / css[0];
  const sy = s.internalHeight / css[1];
  const [cx, cy, rx, ry] = await page
    .locator('svg.overlay g[data-overlay="edge"] ellipse.line')
    .evaluate((e) => ['cx', 'cy', 'rx', 'ry'].map((a) => Number(e.getAttribute(a))));
  const c = [cx! * sx, cy! * sy];
  const r = [rx! * sx, ry! * sy];
  const x0 = Math.max(0, Math.floor(c[0]! - r[0]! - 4));
  const y0 = Math.max(0, Math.floor(c[1]! - r[1]! - 4));
  const x1 = Math.min(s.internalWidth, Math.ceil(c[0]! + r[0]! + 4));
  const y1 = Math.min(s.internalHeight, Math.ceil(c[1]! + r[1]! + 4));
  const img = await page.evaluate((rect) => window.photonring!.debug.presentedImage(rect), {
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
  });
  const bytes = Buffer.from(img.rgba, 'base64');
  let inside = 0;
  let outside = 0;
  for (let j = 0; j < img.height; j++) {
    for (let i = 0; i < img.width; i++) {
      const p = 4 * (j * img.width + i);
      const [R, G, B] = [bytes[p]!, bytes[p + 1]!, bytes[p + 2]!];
      expect(R > 200 && G < 60 && B > 200, 'step-limit colour').toBe(false);
      // Distance from the pixel centre to the ellipse, along the ray from its centre.
      const dx = x0 + i + 0.5 - c[0]!;
      const dy = y0 + j + 0.5 - c[1]!;
      const d = Math.hypot(dx, dy);
      const q = Math.hypot(dx / r[0]!, dy / r[1]!);
      if (q === 0) continue;
      const black = R + G + B < 12;
      if (d * (1 / q - 1) > 1) {
        inside++;
        expect(black, `pixel ${x0 + i},${y0 + j} inside the edge`).toBe(true);
      } else if (d * (1 - 1 / q) > 1) {
        outside++;
        expect(black, `pixel ${x0 + i},${y0 + j} outside the edge`).toBe(false);
      }
    }
  }
  expect(inside).toBeGreaterThan(100);
  expect(outside).toBeGreaterThan(100);
  console.log(
    `${path}: ${s.internalWidth} x ${s.internalHeight} internal, ${css[0]} x ${css[1]} CSS, ` +
      `${inside} pixels inside and ${outside} outside checked`,
  );
}

const hash = (r: number) => `#v=1&r=${r}&az=0&el=12&disk=0&aa=0&view=termination&ov=edge&val=0`;

test.describe('device pixel ratio 1, 1280 x 720', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  for (const r of [10, 30, 100]) {
    test(`${r} M`, async ({ page }) => checkAlignment(page, `/${hash(r)}`));
  }
  test('30 M with the texture size capped at 700', async ({ page }) =>
    checkAlignment(page, `/?maxdim=700${hash(30)}`));
});

test.describe('device pixel ratio 2', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  test('30 M', async ({ page }) => checkAlignment(page, `/${hash(30)}`));
});

test.describe('device pixel ratio 3, phone portrait', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  test('30 M', async ({ page }) => checkAlignment(page, `/${hash(30)}`));
});
