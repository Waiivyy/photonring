// The About dialog (Stage 4): the honesty note, what the image shows and its limits, what the
// lines mean, the controls, a privacy statement and the documentation links; keyboard and focus
// behaviour of a modal dialog.
import { KEYMAP } from '../../src/ui/keymap.ts';
import { expect, openApp, test, view, waitForFullImage } from './fixtures.ts';

const HONESTY =
  'This is a toy model for learning and demonstration, not a scientific simulation of any real observation.';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('the About button opens a modal dialog with the honesty note first', async ({ page }) => {
  await page.getByRole('button', { name: 'About', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'About photonring' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'About photonring' })).toBeFocused();
  await expect(dialog.locator('.honesty')).toHaveText(HONESTY);
  // First: right after the heading.
  await expect(dialog.locator('h2 + p.honesty')).toHaveCount(1);
  await expect(dialog).toContainText('runs entirely in your browser');
  await expect(dialog).toContainText('no analytics, telemetry or cookies');
  await expect(dialog).toContainText(/after #/);
  await expect(dialog).toContainText('Schwarzschild');
  await expect(dialog).toContainText(
    /apparent outline of both the event horizon and the photon sphere/,
  );
});

test('the controls table has one row per key binding', async ({ page }) => {
  await view(page).focus();
  await page.keyboard.press('Shift+Slash');
  const dialog = page.getByRole('dialog', { name: 'About photonring' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('table.keys tbody tr')).toHaveCount(KEYMAP.length);
});

test('documentation links go to GitHub, marked as such, without a referrer', async ({ page }) => {
  await page.getByRole('button', { name: 'About', exact: true }).click();
  const links = page.getByRole('dialog').getByRole('link');
  const n = await links.count();
  expect(n).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < n; i++) {
    const link = links.nth(i);
    expect(await link.getAttribute('href')).toMatch(/^https:\/\/github\.com\/Waiivyy\/photonring/);
    expect(await link.getAttribute('rel')).toBe('noopener noreferrer');
    await expect(link).toContainText('(GitHub)');
  }
});

test('focus stays in the dialog, Escape closes it and focus returns to the opener', async ({
  page,
}) => {
  const about = page.getByRole('button', { name: 'About', exact: true });
  await about.click();
  const dialog = page.getByRole('dialog', { name: 'About photonring' });
  const focusable = await dialog.locator('a, button, [tabindex="0"]').count();
  for (let i = 0; i < 2 * focusable + 2; i++) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return 'body';
      return a.closest('dialog') ? 'dialog' : 'page';
    });
    expect(where).not.toBe('page');
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(about).toBeFocused();
  // Opened from the view with ?, focus goes back to the view.
  await view(page).focus();
  await page.keyboard.press('Shift+Slash');
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(view(page)).toBeFocused();
});

test('device loss with the dialog open leaves Restart reachable and focused', async ({ page }) => {
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => window.photonring!.debug.destroyDevice());
  const restart = page.getByRole('button', { name: /restart/i });
  await expect(restart).toBeFocused();
  await expect(page.getByRole('dialog')).toBeHidden();
  await restart.click();
  await waitForFullImage(page);
});
