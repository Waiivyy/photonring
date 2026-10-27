// The view state in the URL hash, in the real page (Stage 4 Playwright list: "URL state round
// trip including hostile input"; spec section 5, "untrusted input").
import type { Page } from '@playwright/test';
import {
  expect,
  openApp,
  stats,
  test,
  view,
  waitForFullImage,
  waitForSettled,
} from './fixtures.ts';

const NOTICE = 'Some settings in the link were invalid or out of range and have been adjusted.';
const canonical = (patch: Record<string, string> = {}) => {
  const v: Record<string, string> = {
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
  return `#${Object.entries(v)
    .map(([k, x]) => `${k}=${x}`)
    .join('&')}`;
};
const hash = (page: Page) => page.evaluate(() => location.hash);
const elementCount = (page: Page) => page.evaluate(() => document.querySelectorAll('*').length);

test('a shared link opens the view it describes', async ({ page }) => {
  await openApp(
    page,
    `/${canonical({ r: '12.5', az: '45', el: '-30', disk: '0', aa: '0', view: 'termination', ov: 'edge,isco' })}`,
  );
  const s = await stats(page);
  expect([s.distance, s.azimuthDeg, s.elevationDeg]).toEqual([12.5, 45, -30]);
  expect(s.disk).toBe(false);
  expect(s.antialias).toBe(false);
  expect(s.mode).toBe('termination');
  expect(s.overlays).toEqual(['edge', 'isco']);
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Accretion disk', exact: true }),
  ).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Termination view', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'ISCO ring', exact: true })).toBeChecked();
});

test('changes reach the hash in canonical form and survive a reload exactly', async ({ page }) => {
  await openApp(page);
  await view(page).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+Equal');
  await page.keyboard.press('d');
  await page.keyboard.press('e');
  const expected = canonical({ r: '27.273', az: '5', disk: '0', ov: 'edge' });
  await expect.poll(() => hash(page)).toBe(expected);
  const before = await stats(page);
  await page.reload();
  await waitForFullImage(page);
  const after = await stats(page);
  expect([after.distance, after.azimuthDeg, after.elevationDeg]).toEqual([
    before.distance,
    before.azimuthDeg,
    before.elevationDeg,
  ]);
  expect(after.distance).toBe(27.273);
  expect(after.disk).toBe(false);
  expect(after.overlays).toEqual(['edge']);
  expect(await hash(page)).toBe(expected);
});

test('editing the hash applies it at once, with every missing key at its default', async ({
  page,
}) => {
  await openApp(page, `/${canonical({ disk: '0', ov: 'isco' })}`);
  await page.evaluate(() => (location.hash = '#v=1&r=100'));
  await expect.poll(async () => (await stats(page)).distance).toBe(100);
  await expect.poll(async () => (await stats(page)).disk).toBe(true);
  expect((await stats(page)).overlays).toEqual([]);
  await expect.poll(() => hash(page)).toBe(canonical({ r: '100' }));
});

test('camera moves add no history entries', async ({ page }) => {
  await openApp(page);
  const before = await page.evaluate(() => history.length);
  await view(page).focus();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowUp');
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('a plain visit keeps an empty hash until something changes', async ({ page }) => {
  await openApp(page);
  await page.waitForTimeout(500);
  expect(await hash(page)).toBe('');
  await view(page).focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => hash(page)).toBe(canonical({ az: '5' }));
});

test('unknown keys are dropped from the canonical hash', async ({ page }) => {
  await openApp(page, '/#v=1&r=40&future=1&zz=2');
  await expect.poll(() => hash(page)).toBe(canonical({ r: '40' }));
});

test('toggles driven by the hash share the brightness limit', async ({ page }) => {
  await openApp(page);
  const before = (await stats(page)).toggleApplies;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(
      (h) => (location.hash = h),
      canonical({ disk: i % 2 === 0 ? '0' : '1', r: String(40 + i) }),
    );
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(800);
  const s = await stats(page);
  const n = s.toggleApplies - before;
  const times = s.toggleApplyTimes.slice(-n);
  expect(n).toBeLessThanOrEqual(4);
  for (let i = 1; i < times.length; i++)
    expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(500);
  for (const t of times)
    expect(times.filter((u) => u >= t && u <= t + 1000).length).toBeLessThanOrEqual(3);
  expect(s.disk).toBe(true);
  expect(s.distance).toBe(49);
});

const HOSTILE: [string, string, boolean][] = [
  ['#r=NaN', canonical(), true],
  ['#r=1e999', canonical(), true],
  ['#r=-5', canonical({ r: '5' }), true],
  ['#r=2', canonical({ r: '5' }), true],
  ['#el=1000', canonical({ el: '90' }), true],
  ['#az=-725', canonical({ az: '355' }), true],
  ['#%E0%A4%A', canonical(), true],
  ['#__proto__=1&constructor=2', canonical(), false],
  ['#ov=__proto__,constructor,isco,isco,edge', canonical({ ov: 'edge,isco' }), true],
  ['#view=<img src=x onerror=alert(1)>', canonical(), true],
  ['#v=2&r=10', canonical(), true],
  [`#${'r=50&'.repeat(110)}`, canonical(), true],
];

for (const [input, expected, notice] of HOSTILE) {
  const name = input.length > 40 ? `${input.slice(0, 40)}... (${input.length} characters)` : input;
  test(`hostile hash ${name}: rendered safely and canonicalised`, async ({ page, context }) => {
    const clean = await context.newPage();
    await openApp(clean, `/${expected}`);
    await waitForSettled(clean);
    const cleanCount = await elementCount(clean);
    await clean.close();

    // Loaded directly.
    await openApp(page, `/${input}`);
    let s = await stats(page);
    expect(s.state).toBe('rendering');
    expect(s.distance).toBeGreaterThanOrEqual(5);
    expect(s.distance).toBeLessThanOrEqual(200);
    await expect.poll(() => hash(page)).toBe(expected);
    await waitForSettled(page);
    expect(await elementCount(page)).toBe(cleanCount);
    if (notice) await expect(page.locator('#announcer')).toHaveText(NOTICE);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);

    // Applied by a live hashchange.
    await page.evaluate(() => (location.hash = '#v=1&r=77'));
    await expect.poll(async () => (await stats(page)).distance).toBe(77);
    await page.evaluate((h) => (location.hash = h), input);
    await expect.poll(() => hash(page)).toBe(expected);
    await waitForSettled(page);
    s = await stats(page);
    expect(s.state).toBe('rendering');
    expect(await elementCount(page)).toBe(cleanCount);
  });
}

test('after a restart following device loss, a new hash is applied once by the new page', async ({
  page,
}) => {
  await openApp(page, `/${canonical({ r: '50' })}`);
  await page.evaluate(() => window.photonring!.debug.destroyDevice());
  await page.getByRole('button', { name: /restart/i }).click();
  await waitForFullImage(page);
  expect((await stats(page)).distance).toBe(50);
  const applies = (await stats(page)).hashApplies;
  await page.evaluate((h) => (location.hash = h), canonical({ r: '80' }));
  await expect.poll(async () => (await stats(page)).distance).toBe(80);
  await page.waitForTimeout(300);
  expect((await stats(page)).hashApplies).toBe(applies + 1);
});
