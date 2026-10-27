// Reduced motion (Stage 4; spec section 5): the page never moves the camera by itself and has no
// animations or transitions, with or without prefers-reduced-motion.
import { expect, openApp, stats, test, view, waitForSettled } from './fixtures.ts';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`prefers-reduced-motion: ${reducedMotion}: nothing moves without input`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await openApp(page);
    const before = await stats(page);
    await page.waitForTimeout(2000);
    const after = await stats(page);
    expect(after.frames).toBe(before.frames);
    expect([after.distance, after.azimuthDeg, after.elevationDeg]).toEqual([
      before.distance,
      before.azimuthDeg,
      before.elevationDeg,
    ]);
    // After panels, layers and the dialog appear, nothing animates and nothing transitions.
    const still = () =>
      page.evaluate(() => {
        if (document.getAnimations().length > 0) return 'animations running';
        for (const el of document.querySelectorAll('*')) {
          const cs = getComputedStyle(el);
          if (cs.animationName !== 'none') return `animation on ${el.tagName}`;
          if (cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0)) {
            return `transition on ${el.tagName}`;
          }
        }
        return 'still';
      });
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await view(page).focus();
    await page.keyboard.press('e');
    await page.keyboard.press('i');
    await page.keyboard.press('a');
    await waitForSettled(page);
    expect(await still()).toBe('still');
    await page.keyboard.press('v');
    await expect(page.locator('#validation-panel')).toHaveAttribute('data-state', 'done');
    expect(await still()).toBe('still');
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await still()).toBe('still');
  });
}
