import type { ElectronApplication } from '@playwright/test';
import type { Asset, Workspace } from '../../src/domain/models';
import type { DesktopApi } from '../../src/domain/api';
import { chatFixtureData } from './chat-fixture-data';

interface RefreshAction {
  hold?: boolean;
  release?: boolean;
  externalTitle?: string;
  notify?: boolean;
}
type AssetUpdate = Parameters<DesktopApi['updateAsset']>[0];
interface RefreshStatus {
  reads: number;
  pending: number;
}
export async function installAssetRefreshFixture(desktop: ElectronApplication, video: boolean) {
  const asset: Asset = {
    id: 'logo',
    path: '/tmp/asset-refresh/logo.txt',
    relativePath: 'logo.txt',
    title: 'Orbit logo',
    description: 'Logo direction',
    tags: ['brand'],
    kind: 'other',
    hash: 'fixture-hash',
    revision: 'a'.repeat(64),
    size: 50,
    shared: !video,
    mediaUrl: '',
  };
  await desktop.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      let workspace = fixture.workspace;
      let hold = false;
      let reads = 0;
      const saves: AssetUpdate[] = [];
      const pending: { snapshot: Workspace; resolve: (value: Workspace) => void }[] = [];
      ipcMain.on('vandashi:asset-refresh-control', (_event, action: RefreshAction) => {
        if (action.hold !== undefined) hold = action.hold;
        if (action.externalTitle) {
          workspace = {
            ...workspace,
            revision: 'external',
            assets: workspace.assets.map((entry) => ({
              ...entry,
              title: action.externalTitle ?? '',
              revision: 'b'.repeat(64),
            })),
          };
          if (action.notify !== false)
            BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', {
              type: 'workspace-changed',
              scope: workspace.scope,
            });
        }
        if (action.release) {
          const request = pending.shift();
          if (!request) throw new Error('No pending asset read.');
          request.resolve(request.snapshot);
        }
      });
      ipcMain.on('vandashi:asset-refresh-status', (_event, reply: (status: RefreshStatus) => void) => {
        reply({ reads, pending: pending.length });
      });
      ipcMain.on('vandashi:asset-save-requests', (_event, reply: (value: AssetUpdate[]) => void) => {
        reply(saves);
      });
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        if (method === 'getState') return fixture.state;
        if (method === 'models') return fixture.models;
        if (method === 'openBrand') return workspace;
        if (method === 'openWorkspace') {
          reads++;
          if (!hold) return workspace;
          return new Promise<Workspace>((resolve) => {
            pending.push({ snapshot: structuredClone(workspace), resolve });
          });
        }
        if (method === 'checks')
          return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'sessions') return fixture.sessions;
        if (method === 'suggestCommit')
          return { title: 'Update asset details', body: 'Save reviewed metadata.' };
        if (method === 'updateAsset') {
          const input = args[0] as AssetUpdate;
          saves.push(input);
          const asset = workspace.assets.find((entry) => entry.id === input.assetId);
          if (!asset) throw new Error('Missing asset');
          if (input.expectedRevision !== asset.revision)
            throw new Error('This asset changed outside the editor. Reset its details before saving.');
          const saved = {
            ...asset,
            title: input.title,
            description: input.description,
            tags: input.tags,
            revision: 'c'.repeat(64),
          };
          workspace = { ...workspace, assets: [saved], revision: 'saved' };
          return saved;
        }
        throw new Error(`Unexpected asset refresh method ${method}`);
      });
    },
    chatFixtureData(video, { assets: [asset] }),
  );
}

export function assetSaveRequests(desktop: ElectronApplication): Promise<AssetUpdate[]> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<AssetUpdate[]>((resolve) => {
        ipcMain.emit('vandashi:asset-save-requests', undefined, resolve);
      }),
  );
}

export async function assetRefreshControl(desktop: ElectronApplication, action: RefreshAction) {
  await desktop.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:asset-refresh-control', undefined, value);
  }, action);
}

export function assetRefreshStatus(desktop: ElectronApplication): Promise<RefreshStatus> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<RefreshStatus>((resolve) => {
        ipcMain.emit('vandashi:asset-refresh-status', undefined, resolve);
      }),
  );
}
