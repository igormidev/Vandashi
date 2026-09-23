import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from './fixtures';
import { audioFixture } from './audio-fixture';

test('opens the actual isolated desktop shell with a constrained preload', async ({
  desktopApp,
  page,
  userData,
}) => {
  await expect(page.getByRole('button', { name: 'Create a brand' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => ({
      hasRequire: 'require' in window,
      hasProcess: 'process' in window,
      hasGenericInvoke: Object.hasOwn(window.vandashi ?? {}, 'invoke'),
    })),
  ).toEqual({ hasRequire: false, hasProcess: false, hasGenericInvoke: false });
  const security = await desktopApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('No app window');
    return { minimum: window.getMinimumSize() };
  });
  expect(security).toEqual({ minimum: [1200, 720] });
  const unselected = join(userData, 'unselected.png');
  await writeFile(unselected, 'not selected by the user');
  const error = await page.evaluate(async (sourcePath) => {
    try {
      if (!window.vandashi) throw new Error('Missing preload');
      await window.vandashi.describeAsset({
        scope: { brandId: 'fake', videoId: null, clipId: null },
        path: sourcePath,
      });
      return '';
    } catch (failure) {
      return String(failure);
    }
  }, unselected);
  expect(error).toContain('outside registered workspaces');
});

test('native picker grants authorize real imports and media stays confined to the brand', async ({
  desktopApp,
  page,
  userData,
}) => {
  const source = join(userData, 'selected.png');
  await writeFile(
    source,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  await desktopApp.evaluate(({ dialog }, selection) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selection] });
  }, userData);
  const brand = await page.evaluate(async () => {
    if (!window.vandashi) throw new Error('Missing preload');
    const parentPath = await window.vandashi.chooseDirectory();
    if (!parentPath) throw new Error('No folder selected');
    return window.vandashi.createBrand({ parentPath, name: 'Bridge test brand' });
  });
  const scope = { brandId: brand.id, videoId: null, clipId: null };
  const denied = await page.evaluate(
    async ({ scope, sourcePath }) => {
      try {
        if (!window.vandashi) throw new Error('Missing preload');
        await window.vandashi.importAsset({
          scope,
          draft: { sourcePath, title: 'A pixel', description: 'Test image', tags: [], kind: 'image' },
        });
        return '';
      } catch (failure) {
        return String(failure);
      }
    },
    { scope, sourcePath: source },
  );
  expect(denied).toContain('outside registered workspaces');
  await desktopApp.evaluate(({ dialog }, selection) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selection] });
  }, source);
  const imported = await page.evaluate(async (scope) => {
    if (!window.vandashi) throw new Error('Missing preload');
    const [sourcePath] = await window.vandashi.chooseFiles('images');
    if (!sourcePath) throw new Error('No image selected');
    return window.vandashi.importAsset({
      scope,
      draft: { sourcePath, title: 'A pixel', description: 'Test image', tags: ['test'], kind: 'image' },
    });
  }, scope);
  const selectedPreview = await page.evaluate(async (path) => {
    if (!window.vandashi) throw new Error('Missing preload');
    const image = new Image();
    image.src = await window.vandashi.mediaUrl(path);
    await image.decode();
    return image.naturalWidth;
  }, source);
  expect(selectedPreview).toBe(1);
  const dimensions = await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, imported.mediaUrl);
  expect(dimensions).toEqual([1, 1]);
  const configDenied = await page.evaluate(
    async (path) => {
      try {
        if (!window.vandashi) throw new Error('Missing preload');
        await window.vandashi.mediaUrl(path);
        return '';
      } catch (failure) {
        return String(failure);
      }
    },
    join(brand.path, 'brand_identity', '.git', 'config'),
  );
  expect(configDenied).toContain('Unsupported media request');
  const audio = join(userData, 'selected.wav');
  await writeFile(audio, audioFixture());
  await desktopApp.evaluate(({ dialog }, selection) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selection] });
  }, audio);
  const waveform = await page.evaluate(async (scope) => {
    if (!window.vandashi) throw new Error('Missing preload');
    const [sourcePath] = await window.vandashi.chooseFiles('assets');
    if (!sourcePath) throw new Error('Missing audio selection');
    const asset = await window.vandashi.importAsset({
      scope,
      draft: { sourcePath, title: 'Audio', description: '', tags: [], kind: 'audio' },
    });
    return window.vandashi.assetWaveform({ scope, assetId: asset.id });
  }, scope);
  expect(waveform).toHaveLength(100);
  expect(waveform.every((peak) => peak > 0.02 && peak <= 1)).toBe(true);
});

test('native close confirmation preserves work until closing is explicitly selected', async ({
  desktopApp,
  page,
}) => {
  // Electron handles beforeunload itself; suppress Playwright's competing automatic dismissal.
  page.on('dialog', () => undefined);
  await page.evaluate(() => {
    window.addEventListener('beforeunload', (event) => {
      event.preventDefault();
    });
  });
  await desktopApp.evaluate(({ BrowserWindow, dialog }) => {
    dialog.showMessageBoxSync = () => 0;
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await expect(page.getByRole('button', { name: 'Create a brand' })).toBeVisible();
  expect(await desktopApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  const closed = desktopApp.waitForEvent('close');
  await desktopApp.evaluate(({ BrowserWindow, dialog }) => {
    dialog.showMessageBoxSync = () => 1;
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await closed;
});
