import { test, expect } from '@playwright/test';
import { catalogs } from '../../landing/src/locales/catalogs';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`setup copying owns pending feedback and recovers from denial with ${reducedMotion} motion`, async ({
    page,
  }) => {
    const attempts: string[] = [];
    const pending: { resolve: () => void; reject: (error: Error) => void }[] = [];
    await page.exposeFunction('copySetupForTest', (value: string) => {
      attempts.push(value);
      return new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: (value: string) =>
            (Reflect.get(window, 'copySetupForTest') as (text: string) => Promise<void>)(value),
        },
      });
    });
    await page.emulateMedia({ reducedMotion });
    await page.goto('?lang=en');
    const copy = catalogs.en;
    const button = page.locator('.setup-actions button');
    const status = page.getByRole('status');
    for (const outcome of ['copied', 'failed', 'copied'] as const) {
      const before = attempts.length;
      await button.click();
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute('aria-busy', 'true');
      await expect(button).toHaveAccessibleName(copy.copy);
      await expect(status).toBeEmpty();
      const spinner = button.locator('.copy-spinner');
      await expect(spinner).toBeVisible();
      expect(await spinner.evaluate((element) => getComputedStyle(element).animationName)).toBe(
        reducedMotion === 'reduce' ? 'none' : 'copy-spin',
      );
      await expect.poll(() => pending.length).toBe(1);
      await button.evaluate((element) => {
        if (!(element instanceof HTMLButtonElement)) throw new Error('Missing copy control');
        element.click();
        element.click();
      });
      expect(attempts).toHaveLength(before + 1);
      expect(attempts.at(-1)).toBe(copy.setupPrompt);
      const request = pending.shift();
      if (!request) throw new Error('Missing pending clipboard write');
      if (outcome === 'failed') request.reject(new Error('Clipboard permission denied'));
      else request.resolve();
      await expect(button).toBeEnabled();
      await expect(button).toHaveAttribute('aria-busy', 'false');
      await expect(spinner).toHaveCount(0);
      await expect(status).toHaveText(outcome === 'copied' ? copy.copied : copy.copyFailed);
      if (outcome === 'failed') {
        const prompt = page.getByRole('textbox', { name: copy.promptLabel, exact: true });
        await expect(prompt).toBeVisible();
        await expect(prompt).toHaveValue(copy.setupPrompt);
      }
    }
  });
}
