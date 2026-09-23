import { test, expect } from './fixtures';
import { installChatFixture } from './chat-fixture';

for (const video of [false, true]) {
  test(`${video ? 'packaging' : 'brand'} fields fit the minimum window at either divider limit`, async ({
    desktopApp,
    page,
  }) => {
    await installChatFixture(desktopApp, video, { references: true });
    await desktopApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1200, 700);
    });
    await page.reload();
    const divider = page.getByRole('slider', { name: 'Resize panels', exact: true });
    await expect(divider).toBeVisible();
    await divider.focus();
    for (let index = 0; index < 25; index++) await divider.press('ArrowRight');
    await expect(divider).toHaveAttribute('aria-valuenow', '75');
    const panel = page.locator('.split-right .panel-scroll');
    await expect
      .poll(() => panel.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(1);
    if (!video) {
      const browser = page.getByRole('textbox', { name: 'YouTube Browser', exact: true });
      await browser.fill('Arc');
      await expect(browser).toHaveValue('Arc');
      await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    }
    await divider.focus();
    for (let index = 0; index < 25; index++) await divider.press('ArrowLeft');
    await expect(divider).toHaveAttribute('aria-valuenow', '25');
    await expect
      .poll(() =>
        page.locator('.split-left').evaluate((element) => element.scrollWidth - element.clientWidth),
      )
      .toBeLessThanOrEqual(1);
  });
}
