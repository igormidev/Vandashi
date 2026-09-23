import type { DesktopApi } from '../../src/domain/api';
import type { AssetDraft } from '../../src/domain/models';
import type { ElectronApplication } from '@playwright/test';
import { chatFixtureData } from './chat-fixture-data';
import { test, expect, probeUrl } from './development-fixtures';

interface InspectionStatus {
  requests: string[];
  cancelled: string[];
}
function status(desktop: ElectronApplication): Promise<InspectionStatus> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<InspectionStatus>((resolve) => {
        ipcMain.emit('vandashi:strict-inspection-status', undefined, resolve);
      }),
  );
}

test('development StrictMode reattaches one asset inspection and retains cancellation ownership', async ({
  desktopApp,
  page,
  rendererUrl,
}) => {
  await desktopApp.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      const requests: string[] = [];
      const cancelled: string[] = [];
      let pending: { id: string; finish: (result: unknown) => void } | undefined;
      let finishCancel: (() => void) | undefined;
      ipcMain.on('vandashi:strict-inspection-status', (_event, reply: (value: InspectionStatus) => void) => {
        reply({ requests, cancelled });
      });
      ipcMain.on('vandashi:strict-inspection-complete', () => {
        pending?.finish({
          sourcePath: '/tmp/strict-poster.png',
          sourceHash: 'a'.repeat(64),
          title: 'StrictMode poster',
          description: 'A verified test poster.',
          tags: ['poster'],
          kind: 'image',
        } satisfies AssetDraft);
        pending = undefined;
      });
      ipcMain.on('vandashi:strict-inspection-cleanup', () => {
        pending?.finish({
          __vandashiFailure: 'v1',
          diagnostic: { kind: 'app', message: { id: 'mediaInspectionCancelled' } },
        });
        pending = undefined;
        finishCancel?.();
      });
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        if (method === 'getState') return fixture.state;
        if (method === 'models') return fixture.models;
        if (method === 'openBrand' || method === 'openWorkspace') return fixture.workspace;
        if (method === 'sessions') return fixture.sessions;
        if (method === 'openChat') return fixture.sessions[0];
        if (method === 'openConversation') return fixture.sessions.find((session) => session.id === args[0]);
        if (method === 'checks')
          return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'chooseFiles') return ['/tmp/strict-poster.png'];
        if (method === 'describeAsset') {
          const input = args[0] as Parameters<DesktopApi['describeAsset']>[0];
          requests.push(input.requestId);
          if (pending)
            return {
              __vandashiFailure: 'v1',
              diagnostic: { kind: 'app', message: { id: 'appOperationBusy' } },
            };
          BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', {
            type: 'asset-inspection',
            scope: input.scope,
            sourcePath: input.path,
            requestId: input.requestId,
            inspection: { phase: 'frames', progress: 0.4 },
          });
          return new Promise((resolve) => {
            pending = { id: input.requestId, finish: resolve };
          });
        }
        if (method === 'cancelAssetInspection') {
          const requestId = args[0];
          if (typeof requestId !== 'string' || pending?.id !== requestId)
            throw new Error('Lost inspection ownership.');
          cancelled.push(requestId);
          return new Promise<void>((resolve) => {
            finishCancel = resolve;
          });
        }
        throw new Error(`Unexpected development inspection method ${method}`);
      });
    },
    chatFixtureData(false, {}),
  );
  await page.reload();
  await expect(page).toHaveURL(rendererUrl);
  const mode = await page.evaluate(async (path) => {
    const module: unknown = await import(path);
    if (
      !module ||
      typeof module !== 'object' ||
      !('mount' in module) ||
      typeof module.mount !== 'function' ||
      !('development' in module) ||
      !('mode' in module)
    )
      throw new Error('Missing StrictMode development proof.');
    Reflect.apply(module.mount, module, []);
    return { development: module.development, mode: module.mode };
  }, probeUrl);
  expect(mode).toEqual({ development: true, mode: 'development' });
  await expect(page.getByTestId('strictmode-replay-proof')).toHaveAttribute('data-setups', '2');
  await expect(page.getByTestId('strictmode-replay-proof')).toHaveAttribute('data-cleanups', '1');
  await page.getByRole('navigation').getByRole('button', { name: 'Shared assets', exact: true }).click();
  await page.getByRole('button', { name: 'Add assets', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Add to library', exact: true });
  await expect(modal.getByText('Inspecting sampled video frames…')).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  expect((await status(desktopApp)).requests).toHaveLength(1);
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('vandashi:strict-inspection-complete');
  });
  await expect(modal.getByRole('textbox', { name: 'Asset title', exact: true })).toHaveValue(
    'StrictMode poster',
  );
  expect((await status(desktopApp)).requests).toHaveLength(1);
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(modal).toBeHidden();
  await page.getByRole('button', { name: 'Add assets', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  const second = await status(desktopApp);
  expect(second.requests).toHaveLength(2);
  expect(new Set(second.requests).size).toBe(2);
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Stopping inspection…', exact: true })).toBeDisabled();
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  expect((await status(desktopApp)).cancelled).toEqual([second.requests[1]]);
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('vandashi:strict-inspection-cleanup');
  });
  await expect(modal).toBeHidden();
  await expect(page.locator('.asset-tile')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add assets', exact: true })).toBeEnabled();
});
