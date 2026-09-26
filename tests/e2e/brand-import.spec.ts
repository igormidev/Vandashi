import { mkdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { LocalGit } from '../../src/infrastructure/git/local-git';
import { LocalStorage } from '../../src/infrastructure/storage/local-storage';
import { test, expect } from './fixtures';

test('opens an existing brand through the native grant and retains progress through folder selection', async ({
  desktopApp,
  page,
  userData,
}) => {
  const parent = join(userData, 'External brands');
  await mkdir(parent);
  const store = new LocalStorage(join(userData, 'Other profile'), new LocalGit());
  const brand = await store.createBrand({ parentPath: parent, name: 'Existing channel' });
  const video = await store.createVideo({ brandId: brand.id, name: 'Existing video', ratio: '16:9' });
  await desktopApp.evaluate(({ ipcMain, dialog }, path) => {
    type Handler = (event: IpcMainInvokeEvent, method: unknown, args: unknown) => unknown;
    const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers.get(
      'vandashi:invoke',
    );
    if (!invoke) throw new Error('Missing production handler');
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (event, method: unknown, args: unknown) => {
      if (method === 'models') return [];
      if (method === 'checks')
        return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
      return invoke(event, method, args);
    });
    dialog.showOpenDialog = () =>
      new Promise((resolve) => {
        ipcMain.once('test:choose-existing-brand', () => {
          resolve({ canceled: false, filePaths: [path] });
        });
      });
  }, brand.path);
  await page.reload();
  await page.getByRole('button', { name: 'Open existing brand', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Opening brand…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Create a brand', exact: true })).toBeDisabled();
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('test:choose-existing-brand');
  });
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Brand', exact: true }),
  ).toBeEnabled();
  const state = JSON.parse(await readFile(join(userData, 'registry.json'), 'utf8')) as {
    brands: { id: string; path: string }[];
  };
  expect(state.brands).toEqual([expect.objectContaining({ id: brand.id, path: await realpath(brand.path) })]);
  await page.getByRole('navigation').getByRole('button', { name: 'Videos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Existing video', exact: true })).toBeVisible();
  expect((await store.listVideos(brand.id))[0]?.id).toBe(video.scope.videoId);
});

test('canceling an existing-brand picker leaves the empty state usable', async ({ desktopApp, page }) => {
  await desktopApp.evaluate(({ dialog }) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: true, filePaths: [] });
  });
  await page.getByRole('button', { name: 'Open existing brand', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open existing brand', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Create a brand', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('an unrelated folder produces a recoverable explanation without adding a brand', async ({
  desktopApp,
  page,
  userData,
}) => {
  const folder = join(userData, 'Not a brand');
  await mkdir(folder);
  await desktopApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
  }, folder);
  await page.getByRole('button', { name: 'Open existing brand', exact: true }).click();
  await expect(page.getByText(/Choose a Vandashi brand folder/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open existing brand', exact: true })).toBeEnabled();
  expect((await new LocalStorage(userData, new LocalGit()).getState()).brands).toEqual([]);
});
