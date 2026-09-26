import type { IpcMainInvokeEvent } from 'electron';
import type { UpdateState } from '../../src/domain/updates';
import { test, expect } from './fixtures';

test('requires two confirmations, retains real download progress and never applies on dismissal', async ({
  desktopApp,
  page,
}) => {
  await desktopApp.evaluate(({ ipcMain, BrowserWindow }) => {
    type Handler = (event: IpcMainInvokeEvent, method: unknown, args: unknown) => unknown;
    const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers.get(
      'vandashi:invoke',
    );
    if (!invoke) throw new Error('Missing handler');
    let state: UpdateState = {
      revision: 0,
      currentVersion: '0.1.2',
      mode: 'installer',
      phase: 'available',
      release: { version: '0.2.0', notes: ['Open existing brands.'] },
      progress: null,
      checked: true,
      diagnostic: null,
    };
    let downloads = 0;
    let applies = 0;
    const emit = (change: Partial<UpdateState>) => {
      state = { ...state, ...change, revision: state.revision + 1 };
      BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', { type: 'update', state });
    };
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (event, method: unknown, args: unknown) => {
      if (method === 'getUpdateState') return state;
      if (method === 'models') return [];
      if (method === 'downloadUpdate') {
        downloads++;
        emit({ phase: 'downloading', progress: 37 });
        return new Promise((resolve) => {
          ipcMain.once('test:update-ready', () => {
            emit({ phase: 'downloaded', progress: null });
            resolve(state);
          });
        });
      }
      if (method === 'applyUpdate') {
        applies++;
        return state;
      }
      return invoke(event, method, args);
    });
    ipcMain.on('test:update-counts', (_event, reply: (counts: number[]) => void) => {
      reply([downloads, applies]);
    });
  });
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Update', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Later', exact: true }).click();
  expect(
    await desktopApp.evaluate(
      ({ ipcMain }) =>
        new Promise<number[]>((resolve) => {
          ipcMain.emit('test:update-counts', null, resolve);
        }),
    ),
  ).toEqual([0, 0]);
  await page.getByRole('button', { name: 'Version 0.2.0 is available', exact: true }).click();
  await modal.getByRole('button', { name: 'Download update', exact: true }).click();
  await expect(modal.getByRole('progressbar')).toHaveAttribute('value', '37');
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await expect(modal.getByRole('button', { name: 'Later', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('test:update-ready');
  });
  await expect(modal.getByRole('button', { name: 'Open installer', exact: true })).toBeEnabled();
  expect(
    await desktopApp.evaluate(
      ({ ipcMain }) =>
        new Promise<number[]>((resolve) => {
          ipcMain.emit('test:update-counts', null, resolve);
        }),
    ),
  ).toEqual([1, 0]);
  await modal.getByRole('button', { name: 'Later', exact: true }).click();
  await page.getByRole('button', { name: 'Version 0.2.0 is ready', exact: true }).click();
  await modal.getByRole('button', { name: 'Open installer', exact: true }).click();
  expect(
    await desktopApp.evaluate(
      ({ ipcMain }) =>
        new Promise<number[]>((resolve) => {
          ipcMain.emit('test:update-counts', null, resolve);
        }),
    ),
  ).toEqual([1, 1]);
});

test('Settings shows immediate local checking feedback, locks dismissal and reports a failed check truthfully', async ({
  desktopApp,
  page,
}) => {
  await desktopApp.evaluate(({ ipcMain }) => {
    type Handler = (event: IpcMainInvokeEvent, method: unknown, args: unknown) => unknown;
    const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers.get(
      'vandashi:invoke',
    );
    if (!invoke) throw new Error('Missing handler');
    const state: UpdateState = {
      revision: 0,
      currentVersion: '0.1.2',
      mode: 'installer',
      phase: 'idle',
      release: null,
      progress: null,
      checked: false,
      diagnostic: null,
    };
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (event, method: unknown, args: unknown) => {
      if (method === 'getUpdateState') return state;
      if (method === 'models') return [];
      if (method === 'checkForUpdates')
        return new Promise((resolve) => {
          ipcMain.once('test:check-failed', () => {
            resolve({
              ...state,
              revision: 1,
              diagnostic: { kind: 'app', message: { id: 'updateCheckFailed' } },
            });
          });
        });
      return invoke(event, method, args);
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const modal = page.getByRole('dialog');
  const check = modal.getByRole('button', { name: 'Check for updates', exact: true });
  const save = modal.getByRole('button', { name: 'Save changes', exact: true });
  const before = await check.boundingBox();
  const after = await save.boundingBox();
  expect(before && after && before.x < after.x && Math.abs(before.y - after.y) < 3).toBeTruthy();
  await check.click();
  await expect(modal.getByRole('button', { name: 'Checking…', exact: true })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  await expect(save).toBeDisabled();
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('test:check-failed');
  });
  await expect(
    modal.getByText('Could not check GitHub for updates. Try again when you are online.'),
  ).toBeVisible();
  await expect(check).toBeEnabled();
  await expect(save).toBeEnabled();
});
