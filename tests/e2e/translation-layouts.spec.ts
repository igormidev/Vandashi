import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { installChatFixture } from './chat-fixture';
import { availableLocales } from '../../src/domain/locales';
import { interfaceCatalogs } from '../../src/renderer/locales/catalogs';

async function fit(page: Page, selector: string) {
  const panel = page.locator(selector);
  await expect(panel).toBeVisible();
  await expect
    .poll(() => panel.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1);
}

for (const locale of availableLocales) {
  for (const video of [false, true]) {
    test(`${locale} ${video ? 'video' : 'brand'} layout preserves controls and content at divider limits`, async ({
      desktopApp,
      page,
    }, testInfo) => {
      const text = interfaceCatalogs[locale];
      await installChatFixture(desktopApp, video, { references: true, clips: true });
      await page.reload();
      await page.evaluate(async (locale) => {
        const api = window.vandashi;
        if (!api) throw new Error('Missing preload');
        await api.settings({ ...(await api.getState()).settings, locale });
      }, locale);
      await desktopApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(1200, 720);
      });
      await page.reload();
      const divider = page.getByRole('slider', { name: text.resizePanels, exact: true });
      await expect(divider).toBeVisible();
      await divider.focus();
      for (let index = 0; index < 25; index++) await divider.press('ArrowRight');
      await expect(divider).toHaveAttribute('aria-valuenow', '75');
      await fit(page, '.split-right .panel-scroll');
      if (video)
        await expect(page.getByRole('textbox', { name: text.titles, exact: true })).toHaveValue('Test title');
      else {
        const name = page.getByRole('textbox', { name: text.name, exact: true });
        await expect(name).toHaveValue('Chat test brand');
        expect((await name.boundingBox())?.width).toBeGreaterThan(200);
      }
      await page.screenshot({ path: testInfo.outputPath('narrow-editor.png') });
      await divider.focus();
      for (let index = 0; index < 25; index++) await divider.press('ArrowLeft');
      await expect(divider).toHaveAttribute('aria-valuenow', '25');
      await fit(page, '.split-left');
      await expect(page.locator('.messages')).toContainText('Saved conversation one');
      await page.screenshot({ path: testInfo.outputPath('narrow-chat.png') });
      if (video) {
        await page.getByRole('button', { name: text.creation, exact: true }).click();
        await expect(page.getByRole('textbox', { name: text.script, exact: true })).toBeVisible();
        await expect(page.locator('hyperframes-player')).toHaveCount(1);
        await expect(page.locator('.toast')).toHaveCount(0);
        await fit(page, '.split-left');
        await expect(page.locator('.chat-tabs')).toContainText(text.brandAttributes);
        await expect(page.locator('.chat-tabs')).toContainText(text.titleLong);
        await page.screenshot({ path: testInfo.outputPath('creation.png') });
        await page.getByRole('button', { name: text.assets, exact: true }).click();
        await expect(page.getByRole('button', { name: text.importAssets, exact: true })).toBeVisible();
        expect(
          await page.locator('.asset-filters select').evaluate(async (element) => {
            await document.fonts.ready;
            const select = element as HTMLSelectElement;
            const style = getComputedStyle(select);
            const context = document.createElement('canvas').getContext('2d');
            if (!context) throw new Error('Missing canvas text measurement');
            context.font = style.font;
            const label = select.options[select.selectedIndex]?.text ?? '';
            return (
              context.measureText(label).width +
              parseFloat(style.paddingLeft) +
              parseFloat(style.paddingRight) -
              select.clientWidth
            );
          }),
        ).toBeLessThanOrEqual(1);
        await fit(page, '.split-right');
        await page.screenshot({ path: testInfo.outputPath('assets.png') });
        await page.getByRole('button', { name: text.launch, exact: true }).click();
        await page
          .locator('.launch-row')
          .filter({ has: page.getByRole('heading', { name: text.youtube, exact: true }) })
          .getByRole('button', { name: text.publish, exact: true })
          .click();
        await expect(page.getByRole('textbox', { name: text.titles, exact: true })).toHaveValue('Test title');
        await fit(page, '.launch-review');
        await page.screenshot({ path: testInfo.outputPath('launch.png') });
        await page.getByRole('button', { name: text.publishPrompt, exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath('launch-bottom.png') });
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
    });
  }
}
