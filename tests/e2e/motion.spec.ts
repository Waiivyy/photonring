// Reduced motion (Stage 4; spec section 5): the page never moves the camera by itself and has no
// animations or transitions, with or without prefers-reduced-motion.
import { expect, openApp, stats, test, view } from './fixtures.ts';

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
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await view(page).focus();
    await page.keyboard.press('e');
    await page.keyboard.press('a');
    const animations = await page.evaluate(() => document.getAnimations().length);
    expect(animations).toBe(0);
    const transition = await page
      .getByRole('region', { name: 'Controls' })
      .evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(transition).toBe('0s');
  });
}
