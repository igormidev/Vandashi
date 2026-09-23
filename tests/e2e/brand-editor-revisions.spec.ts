import type { ElectronApplication, Page } from '@playwright/test';
import type { IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalGit } from '../../src/infrastructure/git/local-git';
import type { Scope } from '../../src/domain/models';
import { test, expect } from './development-fixtures';
import { proveDevelopment } from './startup-development-fixture';

const originalImage =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#f00"/></svg>';

async function openBrand(application: ElectronApplication, page: Page, userData: string) {
  await application.evaluate(({ ipcMain, dialog }, selected) => {
    // Keep real storage, Git, media protocol and native grants; only isolate provider availability.
    type Invoke = (event: IpcMainInvokeEvent, method: unknown, args: unknown) => unknown;
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Invoke> })._invokeHandlers;
    const invoke = handlers.get('vandashi:invoke');
    if (!invoke) throw new Error('Missing production desktop handler');
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (event, method: unknown, args: unknown) => {
      if (method === 'models' || method === 'sessions') return [];
      if (method === 'checks')
        return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
      if (method === 'suggestCommit')
        return { title: 'Confirm identity', body: 'Save the reviewed brand identity.' };
      return invoke(event, method, args);
    });
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selected] });
  }, userData);
  const brand = await page.evaluate(async () => {
    const api = window.vandashi;
    if (!api) throw new Error('Missing desktop API');
    const parentPath = await api.chooseDirectory();
    if (!parentPath) throw new Error('Missing native directory grant');
    return api.createBrand({ parentPath, name: 'Logo studio' });
  });
  const source = join(userData, 'chosen.svg');
  await writeFile(source, originalImage);
  await application.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selected] });
  }, source);
  const workspace = await page.evaluate(async (id) => {
    const api = window.vandashi;
    if (!api) throw new Error('Missing desktop API');
    const initial = await api.openBrand(id);
    const [image] = await api.chooseFiles('images');
    if (!image) throw new Error('Missing native image grant');
    return api.saveWorkspace({
      scope: initial.scope,
      revision: initial.revision,
      brandConfig: { ...initial.brand.config, image },
      documents: [],
      packaging: null,
      commit: { title: 'Choose logo', body: 'Save a portable image in the brand repository.' },
    });
  }, brand.id);
  await page.reload();
  await proveDevelopment(page);
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Logo studio');
  await expect
    .poll(() =>
      page
        .getByRole('img', { name: 'Brand image', exact: true })
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(2);
  return workspace;
}

async function refresh(application: ElectronApplication, scope: Scope) {
  await application.evaluate(({ BrowserWindow }, selected) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', {
      type: 'workspace-changed',
      scope: selected,
    });
  }, scope);
}

test('a normalized same-revision brand save adopts its result and later edits restore global locks', async ({
  desktopApp,
  page,
  userData,
}) => {
  const original = await openBrand(desktopApp, page, userData);
  const name = page.getByRole('textbox', { name: 'Name', exact: true });
  const save = page.locator('.savebar').getByRole('button', { name: 'Save changes', exact: true });
  const videos = page.getByRole('navigation').getByRole('button', { name: 'Videos', exact: true });
  await name.fill('  Logo studio  ');
  await page.getByRole('button', { name: 'Choose file', exact: true }).click();
  await expect(videos).toBeDisabled();
  await save.click();
  const dialog = page.getByRole('dialog', { name: 'Save a version', exact: true });
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(
      async (scope) => (await window.vandashi?.openWorkspace(scope))?.revision,
      original.scope,
    ),
  ).toBe(original.revision);
  await expect(name).toHaveValue('Logo studio');
  await expect(save).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toBeDisabled();
  await expect(videos).toBeEnabled();
  await name.fill('Later manual edit');
  await expect(save).toBeEnabled();
  await expect(videos).toBeDisabled();
  for (const button of await page.getByRole('button', { name: 'Work on this with AI', exact: true }).all())
    await expect(button).toBeDisabled();
});

test('same-path committed logo bytes refresh through the production media capability and a fresh cache identity', async ({
  desktopApp,
  page,
  userData,
}) => {
  const workspace = await openBrand(desktopApp, page, userData);
  const image = page.getByRole('img', { name: 'Brand image', exact: true });
  const previousUrl = await image.getAttribute('src');
  const identity = join(workspace.brand.path, 'brand_identity');
  await writeFile(join(identity, workspace.brand.config.image), originalImage.replaceAll('"2"', '"3"'));
  await new LocalGit().commit(identity, 'Redesign logo', 'Update image bytes without changing its path.');
  await refresh(desktopApp, workspace.scope);
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(3);
  const nextUrl = await image.getAttribute('src');
  expect(nextUrl).not.toBe(previousUrl);
  const before = new URL(previousUrl ?? '');
  const after = new URL(nextUrl ?? '');
  expect(after.protocol).toBe('vandashi-media:');
  expect(after.searchParams.get('path')).toBe(before.searchParams.get('path'));
  expect(after.searchParams.get('revision')).toMatch(/^[a-f0-9]{64}$/);
  expect(after.searchParams.get('revision')).not.toBe(before.searchParams.get('revision'));
});
