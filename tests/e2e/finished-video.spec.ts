import { copyFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from './fixtures';
import { diagnosticFromBridge } from '../../src/domain/diagnostics';
import { chatCalls, chatRequests, installChatFixture } from './chat-fixture';

test('imports from Videos into Launch without entering a composition or sending an upload', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await page.reload();
  await page.getByRole('button', { name: 'Videos', exact: true }).click();
  await page.getByRole('button', { name: 'Import finished video', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Import finished video', exact: true });
  await expect(dialog.getByRole('button', { name: 'Import and open Launch', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await chatCalls(desktopApp)).not.toContain('importFinishedVideo');
  await page.getByRole('button', { name: 'Import finished video', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Import finished video', exact: true });
  await dialog.getByRole('button', { name: 'Choose video file', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue('imported');
  await dialog.getByRole('textbox', { name: 'Project name', exact: true }).fill('Finished film');
  await dialog.getByRole('button', { name: 'Import and open Launch', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Launch suite', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Creation workspace', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Manual editing', exact: true })).toBeDisabled();
  await page
    .locator('.launch-row')
    .filter({ has: page.getByRole('heading', { name: 'YouTube', exact: true }) })
    .getByRole('button', { name: 'Prepare upload', exact: true })
    .click();
  await page.getByRole('button', { name: 'Open upload chat', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveText(
    'Prepared upload request 1',
  );
  const calls = await chatCalls(desktopApp);
  for (const forbidden of ['createVideo', 'startStudio', 'renderVideo', 'sendChat'])
    expect(calls).not.toContain(forbidden);
  expect(await chatRequests(desktopApp)).toContainEqual({
    method: 'importFinishedVideo',
    input: { brandId: 'chat-brand', name: 'Finished film', sourcePath: '/tmp/imported.mp4' },
  });
});

test('uses real native grants and media probing to preserve an imported file across source deletion', async ({
  desktopApp,
  page,
  userData,
}) => {
  const sourcePath = join(userData, 'finished.mp4');
  await copyFile(join(process.cwd(), 'tests/fixtures/chapter-video.mp4'), sourcePath);
  const original = await readFile(sourcePath);
  await desktopApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
  }, userData);
  const brand = await page.evaluate(async () => {
    if (!window.vandashi) throw new Error('No desktop API');
    const parentPath = await window.vandashi.chooseDirectory();
    if (!parentPath) throw new Error('No directory');
    return window.vandashi.createBrand({ parentPath, name: 'Imported media test' });
  });
  const input = { brandId: brand.id, name: 'Finished landscape', sourcePath };
  const denied = await page.evaluate(async (value) => {
    try {
      await window.vandashi?.importFinishedVideo(value);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, input);
  expect(diagnosticFromBridge(denied)).toMatchObject({
    kind: 'app',
    message: { id: 'storageUnregisteredPath' },
  });
  await desktopApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
  }, sourcePath);
  const imported = await page.evaluate(async (value) => {
    if (!window.vandashi) throw new Error('No desktop API');
    await window.vandashi.chooseFiles('video');
    return window.vandashi.importFinishedVideo(value);
  }, input);
  if (!imported.video?.renderedPath) throw new Error('No imported video');
  expect(imported.video.origin).toBe('imported');
  expect(imported.dirty).toBe(false);
  expect(await readFile(imported.video.renderedPath)).toEqual(original);
  expect(await readdir(imported.video.path)).not.toContain('index.html');
  await rm(sourcePath);
  const reloaded = await page.evaluate(
    async (scope) => window.vandashi?.openWorkspace(scope),
    imported.scope,
  );
  expect(reloaded?.video?.renderedPath).toBe(imported.video.renderedPath);
});
