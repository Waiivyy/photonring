// The Validation panel in the page (Stage 4): live measured against analytic shadow radius for
// the current camera distance, measured on an offscreen validation render, announced once per
// measurement, never presented, and idle while closed.
import type { Page } from '@playwright/test';
import { imageRadiusFromConeAngle, shadowAngularRadius } from '../../src/physics/index.ts';
import { expect, openApp, stats, test, view, waitForFullImage } from './fixtures.ts';

const full = (r: number, val = 1) =>
  `/#v=1&r=${r}&az=0&el=12&disk=1&aa=1&view=colour&ov=none&val=${val}`;
const panel = (page: Page) => page.getByRole('region', { name: 'Validation: shadow size' });

/** Counts the sentences written to the live region, from page load on. */
async function recordAnnouncements(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { announcements: string[] }).announcements = seen;
    let last = '';
    new MutationObserver(() => {
      const t = document.getElementById('announcer')?.textContent ?? '';
      // A new message (an emptied region is the announcer re-reading the same text).
      if (t !== last && t !== '') seen.push(t);
      last = t;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}
const announcements = (page: Page) =>
  page.evaluate(() => (window as unknown as { announcements: string[] }).announcements);

test('V and the Validation button open and close the panel', async ({ page }) => {
  await openApp(page);
  const button = page.getByRole('button', { name: 'Validation', exact: true });
  await view(page).focus();
  await page.keyboard.press('v');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(panel(page)).toBeVisible();
  await expect(view(page)).toBeFocused();
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(panel(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('val=0');
});

for (const r of [5, 10, 30, 100, 200]) {
  test(`measured within tolerance at ${r} M, against the analytic radius`, async ({ page }) => {
    await openApp(page, full(r));
    await expect(panel(page)).toHaveAttribute('data-state', 'done');
    await expect(panel(page)).toContainText('Within tolerance');
    const s = await stats(page);
    const analytic = Number(await panel(page).getAttribute('data-analytic-px'));
    const expected = imageRadiusFromConeAngle(
      shadowAngularRadius(s.distance, 1),
      1024,
      Math.tan((s.fovYDeg * Math.PI) / 360),
    );
    expect(Math.abs(analytic / expected - 1)).toBeLessThan(1e-9);
    const measured = Number(await panel(page).getAttribute('data-measured-px'));
    const tolerance = Number(await panel(page).getAttribute('data-tolerance-px'));
    expect(Math.abs(measured - analytic)).toBeLessThanOrEqual(tolerance);
    const result = await page.evaluate(() => window.photonring!.debug.validation());
    expect(result?.pass).toBe(true);
    expect(result?.counts.termination.stepLimit).toBe(0);
  });
}

test('each measurement is announced once and presents no frame', async ({ page }) => {
  await recordAnnouncements(page);
  await openApp(page);
  const framesBefore = (await stats(page)).frames;
  await view(page).focus();
  await page.keyboard.press('v');
  await expect(panel(page)).toHaveAttribute('data-state', 'done');
  await page.waitForTimeout(500);
  expect((await stats(page)).frames).toBe(framesBefore);
  const shadow = (await announcements(page)).filter((t) => t.startsWith('Shadow at'));
  expect(shadow).toHaveLength(1);
  expect(shadow[0]).toMatch(
    /^Shadow at 30\.0 M: measured \d+\.\d{3} degrees, analytic 9\.633 degrees, within tolerance\.$/,
  );
});

test('a zoom sends the panel back to waiting, then measures the new view', async ({ page }) => {
  await openApp(page, full(30));
  await expect(panel(page)).toHaveAttribute('data-state', 'done');
  const runs = (await stats(page)).validationRuns;
  await view(page).focus();
  await page.keyboard.press('Minus');
  await expect(panel(page)).not.toHaveAttribute('data-state', 'done');
  await expect(panel(page)).toContainText(/Waiting for the view to settle|Measuring/);
  await expect(panel(page)).toHaveAttribute('data-state', 'done');
  await waitForFullImage(page);
  expect((await stats(page)).validationRuns).toBe(runs + 1);
  expect((await stats(page)).distance).toBe(33);
  expect((await stats(page)).validationMs).toBeGreaterThan(0);
});

test('nothing is measured while the panel is closed', async ({ page }) => {
  await openApp(page);
  const runs = (await stats(page)).validationRuns;
  await view(page).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Minus');
  await waitForFullImage(page);
  await page.waitForTimeout(300);
  expect((await stats(page)).validationRuns).toBe(runs);
});

test('Escape closes the most recently opened panel first, then the other', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  const controls = page.getByRole('button', { name: 'Controls', exact: true });
  const validation = page.getByRole('button', { name: 'Validation', exact: true });
  await view(page).focus();
  await page.keyboard.press('c');
  await page.keyboard.press('v');
  await expect(controls).toHaveAttribute('aria-expanded', 'true');
  await expect(validation).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(validation).toHaveAttribute('aria-expanded', 'false');
  await expect(controls).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(controls).toHaveAttribute('aria-expanded', 'false');
  await expect(view(page)).toBeFocused();
  // Escape inside the panel closes it and returns focus to its button.
  await validation.click();
  await page.getByRole('button', { name: 'Close validation panel' }).focus();
  await page.keyboard.press('Escape');
  await expect(validation).toHaveAttribute('aria-expanded', 'false');
  await expect(validation).toBeFocused();
});

test('on a narrow screen, opening one panel closes the other', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await view(page).focus();
  await page.keyboard.press('c');
  await page.keyboard.press('v');
  await expect(page.getByRole('button', { name: 'Controls', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(panel(page)).toBeVisible();
});
