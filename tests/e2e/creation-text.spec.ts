import { test, expect } from './development-fixtures';
import {
  creationControl,
  creationObservation,
  installCreationRefreshFixture,
} from './creation-refresh-fixture';

for (const [name, original] of [
  ['CRLF', '# São Paulo\r\n夜の街 🌃\r\n'],
  ['LF', '# São Paulo\n夜の街 🌃\n'],
  ['no final newline', '# São Paulo\n夜の街 🌃'],
] as const) {
  test(`script ${name} content retains Unicode through diff, reset, undo and reviewed handoff`, async ({
    desktopApp,
    page,
    rendererUrl,
  }) => {
    await installCreationRefreshFixture(desktopApp, rendererUrl, original);
    await page.route('**/studio-test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Preview fixture</title>' }),
    );
    await page.reload();
    await page.getByRole('button', { name: 'Creation workspace', exact: true }).click();
    await expect.poll(async () => (await creationObservation(desktopApp)).starts.length).toBe(1);
    await creationControl(desktopApp, { studio: true });
    const script = page.getByRole('textbox', { name: 'Script', exact: true });
    if (name === 'LF') {
      await desktopApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(1200, 720);
      });
      const divider = page.getByRole('slider', { name: 'Resize panels', exact: true });
      for (const [key, limit] of [
        ['ArrowLeft', '25'],
        ['ArrowRight', '75'],
      ] as const) {
        for (let index = 0; index < 25; index++) await divider.press(key);
        await expect(divider).toHaveAttribute('aria-valuenow', limit);
        await page.getByRole('button', { name: 'Increase text size', exact: true }).click();
        await page.keyboard.press('Tab');
        await expect(script).toBeFocused();
        await expect(script).toHaveCSS('outline-width', '2px');
        await expect(script).toHaveCSS('outline-style', 'solid');
        await expect
          .poll(() =>
            page.locator('.split-left').evaluate((element) => element.scrollWidth - element.clientWidth),
          )
          .toBeLessThanOrEqual(1);
        await expect(page.locator('.toast')).toHaveCount(0);
        await page.screenshot({ path: `/tmp/vandashi-script-keyboard-focus-${limit}.png` });
      }
    }
    const visibleOriginal = original.replaceAll('\r\n', '\n');
    await expect(script).toHaveValue(visibleOriginal);
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled();
    const edited = `${visibleOriginal}\n🎬 A nova cena — 안녕하세요\n`;
    await script.fill(edited);
    await page.getByRole('button', { name: 'View changes', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('+🎬 A nova cena — 안녕하세요');
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(script).toHaveValue(visibleOriginal);
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(script).toHaveValue(edited);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const guidance = dialog.getByRole('textbox', { name: 'Direction for AI', exact: true });
    await guidance.fill('Keep 夜の街 and the final newline.');
    await dialog.getByRole('button', { name: 'Save & create', exact: true }).click();
    await expect.poll(async () => (await creationObservation(desktopApp)).scripts.length).toBe(1);
    const sent = (await creationObservation(desktopApp)).scripts[0];
    expect(sent?.content).toBe(edited);
    expect(sent?.guidance).toContain('Keep 夜の街 and the final newline.');
    await creationControl(desktopApp, { acknowledge: true });
    await expect(dialog).toBeHidden();
    await creationControl(desktopApp, { complete: true });
  });
}
