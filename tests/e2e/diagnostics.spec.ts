import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { diagnosticFromBridge } from '../../src/domain/diagnostics';
import { test, expect } from './fixtures';

test('preserves typed failures through real IPC, preload, and contextBridge', async ({
  desktopApp,
  page,
  userData,
}) => {
  await desktopApp.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [directory] });
  }, userData);
  const brand = await page.evaluate(async () => {
    const api = window.vandashi;
    if (!api) throw new Error('Missing desktop API');
    const parentPath = await api.chooseDirectory();
    if (!parentPath) throw new Error('Missing native grant');
    const value = await api.createBrand({ parentPath, name: 'Diagnostic test' });
    const state = await api.getState();
    const saved: Promise<unknown> = api.settings(state.settings);
    if ((await saved) !== undefined) throw new Error('Void result changed');
    return value;
  });
  const path = join(brand.path, 'shared_assets', 'broken.png');
  await writeFile(path, 'This is deliberately not a bitmap.');
  const failure = await page.evaluate(async (source) => {
    try {
      await window.vandashi?.copyImage(source);
      throw new Error('Copy unexpectedly succeeded');
    } catch (error) {
      if (!(error instanceof Error)) throw new Error('Expected copied Error');
      return { message: error.message, hasDiagnostic: 'diagnostic' in error };
    }
  }, path);
  expect(failure.hasDiagnostic).toBe(false);
  expect(diagnosticFromBridge(new Error(failure.message))).toEqual({
    kind: 'app',
    message: { id: 'imageCannotCopy' },
  });
});

test('keeps external errors resembling the machine prefix as external text', async ({ desktopApp, page }) => {
  const external = 'VANDASHI_DIAGNOSTIC_V1:{"kind":"app","message":{"id":"turnSaved"}}';
  await desktopApp.evaluate(({ ipcMain }, message) => {
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', () => {
      throw new Error(message);
    });
  }, external);
  const failure = await page.evaluate(async () => {
    try {
      await window.vandashi?.getState();
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  const diagnostic = diagnosticFromBridge(new Error(failure));
  expect(diagnostic.kind).toBe('external');
  if (diagnostic.kind === 'external') expect(diagnostic.text).toContain(external);
});

test('validates notice diagnostics and bounds legacy external text without decoding it', async ({
  desktopApp,
  page,
}) => {
  await page.getByRole('button', { name: 'Settings' }).waitFor();
  const emit = async (notice: unknown) =>
    desktopApp.evaluate(({ BrowserWindow }, value) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', value);
    }, notice);
  await emit({
    type: 'notice',
    code: 'test',
    detail: 'fallback',
    diagnostic: { kind: 'app', message: null },
  });
  await expect(page.getByRole('status')).toHaveText('Vandashi received an invalid response. Try again.');
  const prefix = 'VANDASHI_DIAGNOSTIC_V1:{"kind":"app","message":{"id":"turnSaved"}}';
  await emit({ type: 'notice', code: 'test', detail: prefix });
  await expect(page.getByRole('status')).toHaveText(prefix);
  await emit({ type: 'notice', code: 'test', detail: 'x'.repeat(40_000) });
  await expect(page.getByRole('status')).toHaveText('x'.repeat(32_768));
});
