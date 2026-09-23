import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { IpcMainInvokeEvent } from 'electron';
import NodeID3 from 'node-id3';
import { test, expect } from './fixtures';

test('imports an MP3 through native grants and plays and seeks its embedded copy in the asset inspector', async ({
  desktopApp,
  page,
  userData,
}) => {
  const source = join(userData, 'original audio.mp3');
  await promisify(execFile)('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=44100:duration=6',
    '-c:a',
    'libmp3lame',
    '-q:a',
    '4',
    source,
  ]);
  const original = await readFile(source);
  await desktopApp.evaluate(({ ipcMain, dialog }, directory) => {
    // Only account-dependent readiness is isolated. Grants, storage, metadata, waveform, and
    // every media request still pass through the production desktop handler and adapters.
    type InvokeHandler = (event: IpcMainInvokeEvent, method: unknown, args: unknown) => unknown;
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, InvokeHandler> })._invokeHandlers;
    const invoke = handlers.get('vandashi:invoke');
    if (!invoke) throw new Error('Missing production desktop handler');
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (event, method: unknown, args: unknown) => {
      if (method === 'models') return [];
      if (method === 'checks')
        return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
      return invoke(event, method, args);
    });
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [directory] });
  }, userData);
  const brand = await page.evaluate(async () => {
    if (!window.vandashi) throw new Error('Missing constrained preload');
    const parentPath = await window.vandashi.chooseDirectory();
    if (!parentPath) throw new Error('Missing native directory grant');
    return window.vandashi.createBrand({ parentPath, name: 'Audio playback test' });
  });
  await desktopApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
  }, source);
  const imported = await page.evaluate(async (brandId) => {
    if (!window.vandashi) throw new Error('Missing constrained preload');
    const [sourcePath] = await window.vandashi.chooseFiles('assets');
    if (!sourcePath) throw new Error('Missing native media grant');
    return window.vandashi.importAsset({
      scope: { brandId, videoId: null, clipId: null },
      draft: {
        sourcePath,
        title: 'Verified MP3 playback',
        description: 'A synthetic six-second tone for playback verification.',
        tags: ['audio', 'verification'],
        kind: 'audio',
      },
    });
  }, brand.id);
  expect(imported.path).not.toBe(source);
  expect(imported.kind).toBe('audio');
  const tags = await NodeID3.Promise.read(imported.path);
  expect(tags.title).toBe('Verified MP3 playback');
  expect(tags.comment?.text).toBe('A synthetic six-second tone for playback verification.');
  expect(await readFile(source)).toEqual(original);
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Shared assets', exact: true }).click();
  await page.locator('.asset-tile').filter({ hasText: 'Verified MP3 playback' }).click();
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible();
  await expect(page.locator('.asset-waveform rect')).toHaveCount(100);
  const audio = page.locator('.asset-inspector audio');
  await expect(audio).toHaveAttribute('controls', '');
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState))
    .toBeGreaterThanOrEqual(1);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.duration)).toBeCloseTo(6, 0);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.error)).toBeNull();
  await audio.evaluate(async (element: HTMLAudioElement) => {
    element.muted = true;
    await element.play();
  });
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(0.4);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThanOrEqual(3);
  await audio.evaluate((element: HTMLAudioElement) => {
    element.currentTime = 3;
  });
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.seeking)).toBe(false);
  await expect
    .poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
    .toBeGreaterThan(3.4);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);
  await audio.evaluate((element: HTMLAudioElement) => {
    element.pause();
  });
  const range = await desktopApp.evaluate(async ({ net }, url) => {
    const response = await net.fetch(url, { headers: { Range: 'bytes=32-95' } });
    return { status: response.status, size: (await response.arrayBuffer()).byteLength };
  }, imported.mediaUrl);
  expect(range).toEqual({ status: 206, size: 64 });
  expect(await readFile(source)).toEqual(original);
});
