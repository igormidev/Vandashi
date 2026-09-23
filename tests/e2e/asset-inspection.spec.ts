import type { Asset, AssetDraft } from '../../src/domain/models';
import { chatFixtureData } from './chat-fixture-data';
import { test, expect } from './fixtures';

test('reviews a multi-file queue with scoped inspection notes and imports only confirmed metadata', async ({
  desktopApp,
  page,
}) => {
  await desktopApp.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      let workspace = fixture.workspace;
      let release: (() => void) | undefined;
      ipcMain.on('vandashi:inspection-release', () => {
        release?.();
      });
      ipcMain.on('vandashi:inspection-unrelated', () => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', {
          type: 'asset-inspection',
          scope: workspace.scope,
          sourcePath: '/tmp/unrelated.mp4',
          requestId: 'unrelated',
          inspection: { phase: 'speech', progress: 1 },
        });
      });
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        if (method === 'getState') return fixture.state;
        if (method === 'models') return fixture.models;
        if (method === 'openBrand' || method === 'openWorkspace') return workspace;
        if (method === 'sessions') return fixture.sessions;
        if (method === 'openChat') return fixture.sessions[0];
        if (method === 'openConversation') return fixture.sessions.find((session) => session.id === args[0]);
        if (method === 'checks')
          return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'chooseFiles') return ['/tmp/clip.mp4', '/tmp/poster.png'];
        if (method === 'describeAsset') {
          const input = args[0] as { path: string; requestId: string };
          if (input.path === '/tmp/poster.png')
            return {
              sourcePath: input.path,
              sourceHash: 'b'.repeat(64),
              title: 'Bicycle poster',
              description: 'A printed bicycle illustration.',
              tags: ['print'],
              kind: 'image',
            } satisfies AssetDraft;
          BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', {
            type: 'asset-inspection',
            scope: workspace.scope,
            sourcePath: '/tmp/clip.mp4',
            requestId: input.requestId,
            inspection: { phase: 'model-download', progress: 0.4 },
          });
          return new Promise<AssetDraft>((resolve) => {
            release = () => {
              resolve({
                sourcePath: '/tmp/clip.mp4',
                sourceHash: 'a'.repeat(64),
                title: 'Bicycle ride',
                description: 'A person rides beside a house.',
                tags: ['travel'],
                kind: 'video',
                inspection: { frames: 6, sampledSeconds: 90, duration: 600, speech: 'recognized' },
              });
            };
          });
        }
        if (method === 'importAsset') {
          const input = args[0] as { draft: AssetDraft };
          if ('inspection' in input.draft)
            throw new Error('Ephemeral inspection data must not enter import metadata');
          if (input.draft.sourceHash !== (input.draft.kind === 'video' ? 'a' : 'b').repeat(64))
            throw new Error('Import lost its inspected source fingerprint');
          const asset: Asset = {
            ...input.draft,
            id: input.draft.sourcePath,
            relativePath: input.draft.sourcePath.slice('/tmp/'.length),
            path: input.draft.sourcePath,
            mediaUrl: '',
            size: 123,
            hash: 'fixture',
            revision: 'a'.repeat(64),
            shared: true,
          };
          workspace = {
            ...workspace,
            assets: [...workspace.assets, asset],
            revision: input.draft.sourcePath,
          };
          return asset;
        }
        throw new Error(`Unexpected inspection fixture method ${method}`);
      });
    },
    chatFixtureData(false, {}),
  );
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Shared assets', exact: true }).click();
  await page.getByRole('button', { name: 'Add assets', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Add to library', exact: true });
  const progress = modal.getByRole('progressbar');
  await expect(progress).toHaveAttribute('value', '0.4');
  await expect(modal.getByText('Downloading the local speech model (80 MB, first use only)…')).toBeVisible();
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('vandashi:inspection-unrelated');
  });
  await expect(progress).toHaveAttribute('value', '0.4');
  await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('vandashi:inspection-release');
  });
  await expect(
    modal.getByText('Description uses 6 sampled frames; unseen events may be missed.'),
  ).toBeVisible();
  await expect(
    modal.getByText('Up to 90 seconds sampled. Speech recognition can make mistakes; review the details.'),
  ).toBeVisible();
  await modal.getByRole('button', { name: 'Add to library', exact: true }).click();
  await expect(modal.getByRole('textbox', { name: 'Asset title', exact: true })).toHaveValue(
    'Bicycle poster',
  );
  await expect(modal.getByText('1 remaining', { exact: true })).toBeVisible();
  await expect(modal.getByRole('note')).toHaveCount(0);
  await expect(modal.getByRole('textbox', { name: 'Tags', exact: true })).toHaveValue('print');
  await modal.getByRole('button', { name: 'Add to library', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByText('Bicycle ride', { exact: true })).toBeVisible();
  await expect(page.getByText('Bicycle poster', { exact: true })).toBeVisible();
  await expect(page.getByText('2 assets', { exact: true })).toBeVisible();
});

test('cancels a first-use inspection and keeps the dialog locked until cleanup completes', async ({
  desktopApp,
  page,
}) => {
  await desktopApp.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      let requestId = '';
      let rejectDescription: ((value: unknown) => void) | undefined;
      let finishCancel: (() => void) | undefined;
      ipcMain.on('vandashi:inspection-cleanup', () => {
        rejectDescription?.({
          __vandashiFailure: 'v1',
          diagnostic: { kind: 'app', message: { id: 'mediaInspectionCancelled' } },
        });
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
        if (method === 'chooseFiles') return ['/tmp/audio.wav'];
        if (method === 'describeAsset') {
          const input = args[0] as { requestId: string };
          requestId = input.requestId;
          BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', {
            type: 'asset-inspection',
            scope: fixture.workspace.scope,
            sourcePath: '/tmp/audio.wav',
            requestId,
            inspection: { phase: 'model-download', progress: 0.1 },
          });
          return new Promise((resolve) => {
            rejectDescription = resolve;
          });
        }
        if (method === 'cancelAssetInspection') {
          if (args[0] !== requestId) throw new Error('Cancelled a different inspection');
          return new Promise<void>((resolve) => {
            finishCancel = resolve;
          });
        }
        throw new Error(`Unexpected cancellation fixture method ${method}`);
      });
    },
    chatFixtureData(false, {}),
  );
  await page.reload();
  const navigation = page.getByRole('navigation', { includeHidden: true });
  await navigation.getByRole('button', { name: 'Shared assets', exact: true }).click();
  await page.getByRole('button', { name: 'Add assets', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Add to library', exact: true });
  await expect(modal.getByRole('progressbar')).toHaveAttribute('value', '0.1');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Stopping inspection…', exact: true })).toBeDisabled();
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  await expect(
    navigation.getByRole('button', { name: 'Brand', exact: true, includeHidden: true }),
  ).toBeDisabled();
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('vandashi:inspection-cleanup');
  });
  await expect(modal).toBeHidden();
  await expect(page.locator('.asset-tile')).toHaveCount(0);
  await expect(
    navigation.getByRole('button', { name: 'Brand', exact: true, includeHidden: true }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Add assets', exact: true })).toBeEnabled();
});
