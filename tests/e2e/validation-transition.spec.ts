import type { DependencyCheck } from '../../src/domain/models';
import { chatFixtureData } from './chat-fixture-data';
import { test, expect } from './fixtures';

test('returning from failed video validation does not bypass unfinished brand validation', async ({
  desktopApp,
  page,
}) => {
  await desktopApp.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      const brandWorkspace = {
        ...fixture.workspace,
        video: null,
        scope: { ...fixture.workspace.scope, videoId: null },
      };
      const codex: DependencyCheck = {
        id: 'Codex',
        status: 'ready',
        detail: 'Ready',
        repairPrompt: null,
        helpUrl: null,
      };
      const missing: DependencyCheck = {
        id: 'Git',
        status: 'missing',
        detail: 'Git is missing in this fixture',
        repairPrompt: null,
        helpUrl: null,
      };
      let opened = fixture.workspace;
      let release: (() => void) | undefined;
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        if (method === 'getState') return fixture.state;
        if (method === 'models') return fixture.models;
        if (method === 'openBrand') {
          const result = opened;
          opened = brandWorkspace;
          return result;
        }
        if (method === 'openWorkspace') return opened;
        if (method === 'checks') {
          const input = args[0] as { video: boolean };
          if (input.video) return [{ ...missing, id: 'Hyperframes' }];
          BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', {
            type: 'checks',
            scope: brandWorkspace.scope,
            video: false,
            checks: [codex],
            progress: 0.5,
            current: 'Git',
          });
          return new Promise<DependencyCheck[]>((resolve) => {
            release = () => {
              resolve([codex, missing]);
            };
          });
        }
        if (method === 'sessions' || method === 'listVideos') return [];
        throw new Error(`Unexpected validation fixture call ${method}`);
      });
      ipcMain.on('vandashi:test-brand-check', () => {
        release?.();
      });
    },
    chatFixtureData(true, {}),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Check again', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  await expect(page.getByRole('heading', { name: 'Preparing your workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Videos', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'New video', exact: true })).toHaveCount(0);
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('vandashi:test-brand-check');
  });
  await expect(page.getByText('Git is missing in this fixture', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Videos', exact: true })).toBeDisabled();
});
