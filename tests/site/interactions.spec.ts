import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { siteLocales } from '../../landing/src/language';
import { catalogs } from '../../landing/src/locales/catalogs';

for (const locale of siteLocales) {
  test(`${locale} sends the exact setup prompt to the clipboard and recovers from repeated denial`, async ({
    page,
  }) => {
    const attempts: string[] = [];
    let denied = false;
    await page.exposeFunction('copySetupForTest', (value: string) => {
      attempts.push(value);
      if (denied) throw new Error('Clipboard permission denied');
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: (value: string) =>
            (Reflect.get(window, 'copySetupForTest') as (text: string) => Promise<void>)(value),
        },
      });
    });
    await page.goto(`?lang=${locale}`);
    const copy = catalogs[locale];
    await page.getByRole('button', { name: copy.copy, exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(copy.copied);
    expect(attempts).toEqual([copy.setupPrompt]);
    denied = true;
    await page.getByRole('button', { name: copy.copied, exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(copy.copyFailed);
    const prompt = page.getByRole('textbox', { name: copy.promptLabel, exact: true });
    await expect(prompt).toBeVisible();
    await expect(prompt).toHaveValue(copy.setupPrompt);
    await expect(prompt).toHaveAttribute('readonly', '');
    await prompt.focus();
    await prompt.press('ControlOrMeta+A');
    expect(
      await prompt.evaluate((element) => {
        if (!(element instanceof HTMLTextAreaElement)) throw new Error('Prompt is not selectable');
        return element.value.slice(element.selectionStart, element.selectionEnd);
      }),
    ).toBe(copy.setupPrompt);
    await page.locator('summary').click();
    await expect(prompt).toBeHidden();
    await page.getByRole('button', { name: copy.copy, exact: true }).click();
    await expect(prompt).toBeVisible();
    expect(attempts).toEqual([copy.setupPrompt, copy.setupPrompt, copy.setupPrompt]);
  });

  test(`${locale} mobile screenshot supports keyboard pan, Escape, and focus return`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`?lang=${locale}`);
    const copy = catalogs[locale];
    const next = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
    for (const alt of [copy.creationAlt, copy.directionAlt, copy.assetsAlt, copy.clipsAlt]) {
      const trigger = page.getByRole('button', { name: `${copy.enlarge}: ${alt}`, exact: true });
      const expectedSource = await trigger.locator('img').getAttribute('src');
      await trigger.focus();
      await trigger.press('Enter');
      const dialog = page.getByRole('dialog', { name: alt, exact: true });
      await expect(dialog).toBeVisible();
      const close = dialog.getByRole('button', { name: copy.close, exact: true });
      await expect(close).toBeFocused();
      await page.keyboard.press(next);
      const image = dialog.getByRole('link', { name: copy.enlarge, exact: true });
      await expect(image).toBeFocused();
      await expect(image).toHaveAttribute('href', expectedSource ?? '');
      expect(await image.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(
        400,
      );
      await image.press('ArrowRight');
      await expect.poll(() => image.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      if (browserName === 'chromium' && alt === copy.creationAlt) {
        await mkdir('/tmp/vandashi-site-visuals', { recursive: true });
        await page.screenshot({
          path: `/tmp/vandashi-site-visuals/${locale}-390x844-dialog.png`,
          animations: 'disabled',
        });
      }
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  });
}

test('keyboard skip link moves navigation into the main content with visible focus', async ({
  page,
  browserName,
}) => {
  await page.goto('?lang=en');
  const next = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
  await page.keyboard.press(next);
  const skip = page.getByRole('link', { name: catalogs.en.skip, exact: true });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  expect(await skip.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  await page.keyboard.press(next);
  await expect(page.getByRole('link', { name: catalogs.en.run, exact: true })).toBeFocused();
});

test('reduced motion removes smooth scrolling and modal animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('?lang=en');
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).scrollBehavior)).toBe(
    'auto',
  );
  await page.locator('.screenshot').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page.locator('.image-overlay').evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});
