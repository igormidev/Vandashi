import { test, expect } from './fixtures';
import { availableLocales } from '../../src/domain/locales';
import { interfaceCatalogs } from '../../src/renderer/locales/catalogs';
import { nativeMessages } from '../../src/desktop/messages';

for (const locale of availableLocales) {
  test(`${locale} persists language selection and localizes native dialogs at the minimum window`, async ({
    desktopApp,
    page,
  }, testInfo) => {
    const text = interfaceCatalogs[locale];
    const native = nativeMessages(locale);
    // Keep settings persistence and native dialogs real without depending on a runner's Codex account.
    await desktopApp.evaluate(({ ipcMain }) => {
      type Invoke = (event: IpcMainInvokeEvent, method: string, args: unknown[]) => unknown;
      const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Invoke> })._invokeHandlers.get(
        'vandashi:invoke',
      );
      if (!invoke) throw new Error('Missing desktop request handler');
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (event, method: string, args: unknown[]) =>
        method === 'models' ? [] : invoke(event, method, args),
      );
    });
    await page.reload();
    await desktopApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1200, 720);
    });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption(locale);
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: text.createBrand, exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page.reload();
    await expect(page.getByRole('button', { name: text.createBrand, exact: true })).toBeVisible();
    expect(await page.evaluate(async () => (await window.vandashi?.getState())?.settings.locale)).toBe(
      locale,
    );
    await page.getByRole('button', { name: text.settings, exact: true }).click();
    const modal = page.getByRole('dialog', { name: text.settings, exact: true });
    await expect(modal.getByRole('combobox', { name: text.language, exact: true })).toHaveValue(locale);
    await modal.screenshot({ path: testInfo.outputPath('settings-top.png'), animations: 'disabled' });
    await expect
      .poll(() => modal.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(1);
    const save = modal.getByRole('button', { name: text.save, exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await modal.screenshot({ path: testInfo.outputPath('settings-bottom.png'), animations: 'disabled' });
    await modal.getByRole('button', { name: text.close, exact: true }).click();
    if (locale === 'ja' || locale === 'ko') {
      const family = locale === 'ja' ? 'Noto Sans JP Variable' : 'Noto Sans KR Variable';
      const fonts = await page.evaluate(
        async ({ family, sample }) => {
          const loaded = await document.fonts.load(`13px "${family}"`, sample);
          return loaded.map((font) => ({ family: font.family, status: font.status }));
        },
        { family, sample: text.createBrand },
      );
      expect(fonts.length).toBeGreaterThan(0);
      expect(fonts.every((font) => font.status === 'loaded' && font.family === family)).toBe(true);
    }
    await desktopApp.evaluate(({ dialog }) => {
      const probe = globalThis as typeof globalThis & { localeDialogs: unknown[] };
      probe.localeDialogs = [];
      dialog.showOpenDialog = (...args: unknown[]) => {
        probe.localeDialogs.push(args.at(-1));
        return Promise.resolve({ canceled: true, filePaths: [] });
      };
      dialog.showMessageBoxSync = (...args: unknown[]) => {
        probe.localeDialogs.push(args.at(-1));
        return 0;
      };
    });
    await page.evaluate(async () => {
      await window.vandashi?.chooseFiles('images');
      await window.vandashi?.chooseFiles('video');
      window.addEventListener('beforeunload', (event) => {
        event.preventDefault();
      });
    });
    await desktopApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });
    await expect
      .poll(() =>
        desktopApp.evaluate(
          () => (globalThis as typeof globalThis & { localeDialogs: unknown[] }).localeDialogs,
        ),
      )
      .toEqual([
        expect.objectContaining({ filters: [expect.objectContaining({ name: native.imagesFilter })] }),
        expect.objectContaining({ filters: [expect.objectContaining({ name: native.videoFilter })] }),
        expect.objectContaining({
          title: native.closeTitle,
          message: native.closeMessage,
          detail: native.closeDetail,
          buttons: [native.closeKeep, native.closeDiscard],
        }),
      ]);
    await expect(page.getByRole('button', { name: text.createBrand, exact: true })).toBeVisible();
    await desktopApp.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1;
    });
  });
}
import type { IpcMainInvokeEvent } from 'electron';
