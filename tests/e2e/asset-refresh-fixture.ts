import type { ElectronApplication } from '@playwright/test';
import type { Asset, Workspace } from '../../src/domain/models';
import { chatFixtureData } from './chat-fixture-data';

interface RefreshAction {
  hold?: boolean;
  release?: boolean;
  externalTitle?: string;
}
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
    size: 50,
    shared: !video,
    mediaUrl: '',
  };
  await desktop.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      let workspace = fixture.workspace;
      let hold = false;
      let reads = 0;
      const pending: { snapshot: Workspace; resolve: (value: Workspace) => void }[] = [];
      ipcMain.on('vandashi:asset-refresh-control', (_event, action: RefreshAction) => {
        if (action.hold !== undefined) hold = action.hold;
        if (action.externalTitle) {
          workspace = {
            ...workspace,
            revision: 'external',
            assets: workspace.assets.map((entry) => ({ ...entry, title: action.externalTitle ?? '' })),
          };
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
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string) => {
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
        throw new Error(`Unexpected asset refresh method ${method}`);
      });
    },
    chatFixtureData(video, { assets: [asset] }),
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
