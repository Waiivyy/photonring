// Layout and visibility (Stage 4; WCAG 1.4.10 reflow, 2.4.7 and 2.4.11 focus visible and not
// obscured): panels never hide each other, the toolbar or the device-loss alert; nothing scrolls
// sideways at 320 CSS px; the readouts and the legend never overlap; focus rings read on any image.
import type { Locator } from '@playwright/test';
import { expect, openApp, test, view, waitForSettled } from './fixtures.ts';

const full = (patch: Record<string, string> = {}) => {
  const v = {
    v: '1',
    r: '30',
    az: '0',
    el: '12',
    disk: '1',
    aa: '1',
    view: 'colour',
    ov: 'none',
    val: '0',
    ...patch,
  };
  return `/#${Object.entries(v)
    .map(([k, x]) => `${k}=${x}`)
    .join('&')}`;
};

/** Whether the element is what the user hits at its own centre (not covered by anything). */
async function onTop(target: Locator): Promise<boolean> {
  const box = (await target.boundingBox())!;
  return target.evaluate(
    (el, [x, y]) => {
      const hit = document.elementFromPoint(x!, y!);
      return hit !== null && (hit === el || el.contains(hit));
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
}

const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('narrowing the window with both panels open keeps only the newest one', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await view(page).focus();
  await page.keyboard.press('c');
  await page.keyboard.press('v');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Controls', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.getByRole('region', { name: 'Validation: shadow size' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Controls' })).toBeHidden();
});

test('the device-loss alert and its Restart button are above open panels', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await openApp(page, full({ val: '1' }));
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.evaluate(() => window.photonring!.debug.destroyDevice());
  const restart = page.getByRole('button', { name: /restart/i });
  await expect(restart).toBeVisible();
  expect(await onTop(restart)).toBe(true);
  expect(await onTop(page.getByRole('alert').locator('p'))).toBe(true);
});

for (const width of [660, 700, 760, 768, 800, 1000]) {
  test(`at ${width} px the toolbar stays clickable and open panels never cover each other`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await openApp(page, full({ val: '1' }));
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    for (const name of ['Controls', 'Validation', 'Save image', 'About']) {
      expect(await onTop(page.getByRole('button', { name, exact: true })), name).toBe(true);
    }
    const controls = page.locator('#controls-panel');
    const validation = page.locator('#validation-panel');
    if (width <= 760) {
      // Bottom sheets, one at a time.
      await expect(controls).toBeVisible();
      await expect(validation).toBeHidden();
    } else {
      await expect(validation).toBeVisible();
      expect(overlap((await controls.boundingBox())!, (await validation.boundingBox())!)).toBe(
        false,
      );
    }
  });
}

test('on a phone with a sheet open, the legend is shown above the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, full({ val: '1', view: 'termination' }));
  const legend = page.getByRole('list', { name: 'Legend' });
  await expect(legend).toBeVisible();
  // The legend ignores the pointer, so compare boxes rather than hit-testing it.
  const sheet = (await page.locator('#validation-panel').boundingBox())!;
  expect(overlap((await legend.boundingBox())!, sheet)).toBe(false);
});

test('at 320 CSS px nothing scrolls sideways and the readouts do not overlap', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openApp(page, full({ ov: 'edge' }));
  await waitForSettled(page);
  const boxes = await Promise.all(
    ['.hud', '.help', '.legend'].map(async (sel) => (await page.locator(sel).boundingBox())!),
  );
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++)
      expect(overlap(boxes[i]!, boxes[j]!), `${i} ${j}`).toBe(false);
    expect(boxes[i]!.x + boxes[i]!.width).toBeLessThanOrEqual(320);
  }
  const fits = (sel: string) =>
    page.locator(sel).evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  await view(page).focus();
  await page.keyboard.press('c');
  expect(await fits('#controls-panel')).toBe(true);
  await page.keyboard.press('v');
  await expect(page.locator('#validation-panel')).toHaveAttribute('data-state', 'done');
  expect(await fits('#validation-panel')).toBe(true);
  const values = page.locator('#validation-panel dd');
  const panelBox = (await page.locator('#validation-panel').boundingBox())!;
  for (const dd of await values.all()) {
    const b = (await dd.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'About', exact: true }).click();
  expect(await fits('dialog#about')).toBe(true);
});

test('focus rings have a dark ring as well, so they read on the bright disk and the blue sky', async ({
  page,
}) => {
  await openApp(page);
  await page.keyboard.press('Tab');
  await expect(view(page)).toBeFocused();
  expect(await view(page).evaluate((c) => getComputedStyle(c).boxShadow)).toMatch(/rgb\(0, 0, 0\)/);
  await page.keyboard.press('Tab');
  const button = page.getByRole('button', { name: 'Controls', exact: true });
  await expect(button).toBeFocused();
  expect(await button.evaluate((b) => getComputedStyle(b).boxShadow)).toMatch(/rgb\(0, 0, 0\)/);
});
