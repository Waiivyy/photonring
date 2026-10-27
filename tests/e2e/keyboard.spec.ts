// Keyboard controls (Stage 4 Playwright list: "controls work by keyboard"; WCAG 2.1.1 and
// 2.1.4). Shortcuts are single keys active while the view has focus; every action is also a
// native button or checkbox; keys with Ctrl or Cmd are left to the browser.
import type { Page } from '@playwright/test';
import { expect, openApp, stats, test, view } from './fixtures.ts';

const DEFAULT = { distance: 30, azimuthDeg: 0, elevationDeg: 12 };
const camera = async (page: Page) => {
  const s = await stats(page);
  return { distance: s.distance, azimuthDeg: s.azimuthDeg, elevationDeg: s.elevationDeg };
};
const activeName = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return a ? (a.getAttribute('aria-label') ?? a.id ?? a.tagName) : null;
  });

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('Tab order: the view, then the toolbar, then the open panel', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(view(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Controls', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Orbit left' })).toBeFocused();
});

test('Enter and Space open and close the Controls panel', async ({ page }) => {
  const button = page.getByRole('button', { name: 'Controls', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('region', { name: 'Controls' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('region', { name: 'Controls' })).toBeHidden();
});

test('every camera button moves the camera like its key', async ({ page }) => {
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  const cases: [string, Partial<typeof DEFAULT>][] = [
    ['Orbit left', { azimuthDeg: 5 }],
    ['Orbit right', { azimuthDeg: 355 }],
    ['Orbit up', { elevationDeg: 17 }],
    ['Orbit down', { elevationDeg: 7 }],
    ['Zoom in', { distance: 27.273 }],
    ['Zoom out', { distance: 33 }],
  ];
  for (const [name, change] of cases) {
    await page.getByRole('button', { name: 'Reset view' }).click();
    expect(await camera(page)).toEqual(DEFAULT);
    const button = page.getByRole('button', { name, exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
    expect(await camera(page), name).toEqual({ ...DEFAULT, ...change });
  }
});

test('Space toggles the scene and overlay checkboxes', async ({ page }) => {
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  for (const [name, read] of [
    ['Accretion disk', (s: Awaited<ReturnType<typeof stats>>) => s.requestedDisk],
    ['Anti-aliasing', (s: Awaited<ReturnType<typeof stats>>) => s.antialias],
  ] as const) {
    const box = page.getByRole('checkbox', { name, exact: true });
    await expect(box).toBeChecked();
    await box.focus();
    await page.keyboard.press('Space');
    await expect(box).not.toBeChecked();
    expect(read(await stats(page))).toBe(false);
  }
  const edge = page.getByRole('checkbox', { name: 'Shadow edge', exact: true });
  await edge.focus();
  await page.keyboard.press('Space');
  await expect(edge).toBeChecked();
  expect((await stats(page)).overlays).toEqual(['edge']);
});

test('every shortcut works from the view', async ({ page }) => {
  await view(page).focus();
  const key = async (k: string) => page.keyboard.press(k);
  await key('ArrowLeft');
  expect((await camera(page)).azimuthDeg).toBe(5);
  await key('ArrowRight');
  await key('ArrowRight');
  expect((await camera(page)).azimuthDeg).toBe(355);
  await key('ArrowUp');
  expect((await camera(page)).elevationDeg).toBe(17);
  await key('ArrowDown');
  expect((await camera(page)).elevationDeg).toBe(12);
  await key('Equal');
  expect((await camera(page)).distance).toBe(27.273);
  await key('Minus');
  expect((await camera(page)).distance).toBe(30);
  await key('Shift+Equal');
  expect((await camera(page)).distance).toBe(27.273);
  await key('r');
  expect(await camera(page)).toEqual(DEFAULT);
  await key('ArrowLeft');
  await key('Home');
  expect(await camera(page)).toEqual(DEFAULT);
  await key('a');
  expect((await stats(page)).antialias).toBe(false);
  for (const [k, id] of [
    ['e', 'edge'],
    ['h', 'horizon'],
    ['p', 'photon'],
    ['i', 'isco'],
  ] as const) {
    await key(k);
    expect((await stats(page)).overlays).toContain(id);
  }
  expect((await stats(page)).overlays).toEqual(['edge', 'horizon', 'photon', 'isco']);
  await key('d');
  await expect.poll(async () => (await stats(page)).disk).toBe(false);
  await key('t');
  await expect.poll(async () => (await stats(page)).mode).toBe('termination');
  await key('c');
  await expect(page.getByRole('button', { name: 'Controls', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  // Opening a panel by shortcut keeps focus on the view, so orbiting can continue.
  await expect(view(page)).toBeFocused();
});

test('letters do nothing while a button has focus (shortcuts are scoped to the view)', async ({
  page,
}) => {
  const before = await stats(page);
  await page.getByRole('button', { name: 'Controls', exact: true }).focus();
  for (const k of ['d', 'a', 't', 'e', 'r', 'ArrowLeft']) await page.keyboard.press(k);
  const after = await stats(page);
  expect(after.requestedDisk).toBe(before.requestedDisk);
  expect(after.antialias).toBe(before.antialias);
  expect(after.overlays).toEqual(before.overlays);
  expect(after.azimuthDeg).toBe(before.azimuthDeg);
});

test('Escape closes the Controls panel from the view or from inside it', async ({ page }) => {
  const button = page.getByRole('button', { name: 'Controls', exact: true });
  await view(page).focus();
  await page.keyboard.press('c');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.click();
  await page.getByRole('button', { name: 'Orbit left' }).focus();
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toBeFocused();
});

test('keys with Ctrl or Cmd are left to the browser', async ({ page }) => {
  const before = await stats(page);
  const prevented = await view(page).evaluate((canvas) => {
    const out: boolean[] = [];
    for (const key of ['=', '-', '+', 'd', 'a', 't', 'e', 'r']) {
      for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
        const e = new KeyboardEvent('keydown', {
          key,
          [mod]: true,
          bubbles: true,
          cancelable: true,
        });
        canvas.dispatchEvent(e);
        out.push(e.defaultPrevented);
      }
    }
    return out;
  });
  expect(prevented.every((p) => !p)).toBe(true);
  const after = await stats(page);
  expect(after.distance).toBe(before.distance);
  expect(after.requestedDisk).toBe(before.requestedDisk);
  expect(after.antialias).toBe(before.antialias);
  expect(after.overlays).toEqual(before.overlays);
});

test('holding a toggle key toggles once', async ({ page }) => {
  await view(page).focus();
  const before = (await stats(page)).toggleApplies;
  for (let i = 0; i < 6; i++) await page.keyboard.down('d'); // repeats after the first
  await page.keyboard.up('d');
  await page.waitForTimeout(700);
  const s = await stats(page);
  expect(s.toggleApplies - before).toBe(1);
  expect(s.disk).toBe(false);
});

test('ten presses of D in a second change the brightness at most 3 times, 500 ms apart', async ({
  page,
}) => {
  await view(page).focus();
  const before = (await stats(page)).toggleApplies;
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('d');
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(800);
  const s = await stats(page);
  const times = s.toggleApplyTimes.slice(-(s.toggleApplies - before));
  expect(times.length).toBeGreaterThan(0);
  expect(times.length).toBeLessThanOrEqual(4);
  for (let i = 1; i < times.length; i++) {
    expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(499);
  }
  for (const t of times)
    expect(times.filter((u) => u >= t && u <= t + 1000).length).toBeLessThanOrEqual(3);
  // An even number of presses: the disk ends where it started.
  expect(s.disk).toBe(true);
  expect(s.brightnessPending).toBe(false);
});

test('toggles made by shortcut are announced', async ({ page }) => {
  await view(page).focus();
  const announcer = page.locator('#announcer');
  await page.keyboard.press('e');
  await expect(announcer).toHaveText('Shadow edge on');
  await page.keyboard.press('e');
  await expect(announcer).toHaveText('Shadow edge off');
  await page.keyboard.press('r');
  await expect(announcer).toHaveText('View reset');
  expect(await activeName(page)).not.toBeNull();
});
