import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { IpcMainInvokeEvent } from 'electron';
import { expect, test } from './fixtures';

const execute = promisify(execFile);
test.skip(process.platform !== 'darwin', 'Checks installed macOS bundle icons.');

test('production discovery returns each installed application icon rather than a shared placeholder', async ({
  desktopApp,
  page,
  userData,
}) => {
  const browsers = await page.evaluate(() => window.vandashi?.installedBrowsers());
  const icons: string[] = [];
  for (const name of ['Google Chrome', 'Helium', 'Safari', 'ChatGPT']) {
    const bundle = join('/Applications', `${name}.app`);
    const infoPath = join(bundle, 'Contents/Info.plist');
    if (!(await readFile(infoPath).catch(() => null))) continue;
    const { stdout } = await execute('/usr/bin/plutil', ['-convert', 'json', '-o', '-', infoPath]);
    const info = JSON.parse(stdout) as { CFBundleIconFile: string };
    const file = info.CFBundleIconFile.endsWith('.icns')
      ? info.CFBundleIconFile
      : `${info.CFBundleIconFile}.icns`;
    const output = join(userData, `${name}.png`);
    await execute('/usr/bin/sips', [
      '-s',
      'format',
      'png',
      '-Z',
      '64',
      join(bundle, 'Contents/Resources', file),
      '--out',
      output,
    ]);
    const expected = `data:image/png;base64,${(await readFile(output)).toString('base64')}`;
    const actual = browsers?.find((browser) => browser.name === name)?.icon;
    expect(actual, name).toMatch(/^data:image\/png;base64,/u);
    expect(
      await desktopApp.evaluate(
        ({ nativeImage }, images) =>
          nativeImage
            .createFromDataURL(images.actual)
            .toBitmap()
            .equals(nativeImage.createFromDataURL(images.expected).toBitmap()),
        { actual: actual ?? '', expected },
      ),
      name,
    ).toBe(true);
    icons.push(createHash('sha256').update(expected).digest('hex'));
  }
  expect(icons.length).toBeGreaterThan(0);
  expect(new Set(icons).size).toBe(icons.length);
});

test('login questions use neutral aligned text and real icons remain visible after selection', async ({
  desktopApp,
  page,
  userData,
}) => {
  await desktopApp.evaluate(({ ipcMain, dialog }, directory) => {
    type Invoke = (event: IpcMainInvokeEvent, method: unknown, args: unknown) => unknown;
    const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Invoke> })._invokeHandlers.get(
      'vandashi:invoke',
    );
    if (!invoke) throw new Error('Missing production handler');
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (event, method, args) => {
      if (method === 'models') return [];
      if (method === 'checks')
        return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
      return invoke(event, method, args);
    });
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [directory] });
  }, userData);
  await page.evaluate(async () => {
    const api = window.vandashi;
    if (!api) throw new Error('Missing production API');
    const parentPath = await api.chooseDirectory();
    if (!parentPath) throw new Error('Missing directory grant');
    const brand = await api.createBrand({ parentPath, name: 'Browser icon check' });
    await api.openBrand(brand.id);
  });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Browser icon check');
  await page.getByRole('button', { name: 'Show all', exact: true }).click();
  for (const platform of ['Instagram', 'Facebook Reels', 'Rumble']) {
    const button = page.getByRole('button', { name: `Where is ${platform} logged in?`, exact: true });
    await expect(button.locator('span')).toHaveCount(1);
    expect(
      await button.evaluate((element) => {
        const label = element.querySelector('span');
        return label && getComputedStyle(label).color === getComputedStyle(element).color;
      }),
    ).toBe(true);
  }
  await page.screenshot({ path: '/tmp/vandashi-platform-text-neutral.png' });
  const picker = page.getByRole('button', { name: 'Where is YouTube logged in?', exact: true });
  await picker.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.browser-choice').first()).toBeVisible();
  const selected = dialog.locator('.browser-choice').first();
  const name = await selected.locator('span').innerText();
  const icon = selected.locator('img');
  await expect(icon).toBeVisible();
  expect(
    await icon.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
  ).toBe(true);
  const source = await icon.getAttribute('src');
  await page.screenshot({ path: '/tmp/vandashi-installed-browser-icons.png' });
  await selected.click();
  await expect(dialog).toHaveCount(0);
  await expect(picker).toContainText(name);
  await expect(picker.locator('img')).toHaveAttribute('src', source ?? '');
});
