import type { ElectronApplication } from '@playwright/test';
import type { AppEvent, Settings, Workspace } from '../../src/domain/models';
import { chatFixtureData } from './chat-fixture-data';

interface AsyncControl {
  holdWorkspaces?: boolean;
  changedRevision?: string;
  resolveWorkspace?: number;
  rejectWorkspace?: number;
  holdSettings?: boolean;
  finishSettings?: 'resolve' | 'reject';
  holdModels?: boolean;
  finishModels?: boolean;
}
interface AsyncStatus {
  pendingWorkspaces: number[];
  pendingSettings: boolean;
  pendingModels: number;
  savedSettings: Settings;
}

export async function installAsyncEditorsFixture(desktop: ElectronApplication): Promise<void> {
  await desktop.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      let state = fixture.state;
      let workspace = fixture.workspace;
      let sequence = 0;
      let holdWorkspaces = false;
      let holdSettings = false;
      let holdModels = false;
      let pendingSettings: {
        input: Settings;
        resolve: () => void;
        reject: (error: Error) => void;
      } | null = null;
      const pendingModels: (() => void)[] = [];
      const pendingWorkspaces = new Map<
        number,
        { value: Workspace; resolve: (value: Workspace) => void; reject: (error: Error) => void }
      >();
      const emit = (event: AppEvent) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
      ipcMain.on('vandashi:async-control', (_event, action: AsyncControl) => {
        if (action.holdWorkspaces !== undefined) holdWorkspaces = action.holdWorkspaces;
        if (action.holdSettings !== undefined) holdSettings = action.holdSettings;
        if (action.holdModels !== undefined) holdModels = action.holdModels;
        if (action.changedRevision && workspace.video) {
          workspace = {
            ...workspace,
            revision: action.changedRevision,
            video: {
              ...workspace.video,
              packaging: {
                ...workspace.video.packaging,
                titles: { ...workspace.video.packaging.titles, long: [`Server ${action.changedRevision}`] },
              },
            },
          };
          emit({ type: 'activity', activity: { sessionId: 'fixture-edit', phase: 'working', detail: '' } });
          emit({ type: 'activity', activity: { sessionId: 'fixture-edit', phase: 'done', detail: '' } });
          emit({ type: 'workspace-changed', scope: workspace.scope });
        }
        const id = action.resolveWorkspace ?? action.rejectWorkspace;
        if (id !== undefined) {
          const pending = pendingWorkspaces.get(id);
          if (!pending) throw new Error('No pending workspace request.');
          pendingWorkspaces.delete(id);
          if (action.rejectWorkspace !== undefined) pending.reject(new Error('Workspace read failed.'));
          else pending.resolve(pending.value);
        }
        if (action.finishSettings) {
          if (!pendingSettings) throw new Error('No pending settings request.');
          const pending = pendingSettings;
          pendingSettings = null;
          if (action.finishSettings === 'reject') pending.reject(new Error('Settings could not be saved.'));
          else {
            state = { ...state, settings: pending.input };
            pending.resolve();
          }
        }
        if (action.finishModels) {
          holdModels = false;
          for (const finish of pendingModels.splice(0)) finish();
        }
      });
      ipcMain.on('vandashi:async-status', (_event, reply: (status: AsyncStatus) => void) => {
        reply({
          pendingWorkspaces: [...pendingWorkspaces.keys()],
          pendingSettings: pendingSettings !== null,
          pendingModels: pendingModels.length,
          savedSettings: state.settings,
        });
      });
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        if (method === 'getUpdateState')
          return {
            revision: 0,
            currentVersion: '0.1.2',
            mode: 'installer',
            phase: 'unsupported',
            release: null,
            progress: null,
            checked: false,
            diagnostic: null,
          };
        if (method === 'getState') return state;
        if (method === 'models') {
          if (!holdModels) return fixture.models;
          return new Promise<typeof fixture.models>((resolve) => {
            pendingModels.push(() => {
              resolve(fixture.models);
            });
          });
        }
        if (method === 'openBrand') return workspace;
        if (method === 'openWorkspace') {
          if (!holdWorkspaces) return workspace;
          const value = structuredClone(workspace);
          return new Promise<Workspace>((resolve, reject) => {
            pendingWorkspaces.set(++sequence, { value, resolve, reject });
          });
        }
        if (method === 'settings') {
          const input = args[0] as Settings;
          if (!holdSettings) {
            state = { ...state, settings: input };
            return;
          }
          return new Promise<void>((resolve, reject) => {
            pendingSettings = { input, resolve, reject };
          });
        }
        if (method === 'checks')
          return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'sessions') return fixture.sessions;
        if (method === 'listVideos') return workspace.video ? [workspace.video] : [];
        if (method === 'history') return { commits: [], hasMore: false };
        throw new Error(`Unexpected async editor fixture method: ${method}`);
      });
    },
    chatFixtureData(true, {}),
  );
}

export async function asyncEditorControl(desktop: ElectronApplication, action: AsyncControl): Promise<void> {
  await desktop.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:async-control', undefined, value);
  }, action);
}

export function asyncEditorStatus(desktop: ElectronApplication): Promise<AsyncStatus> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<AsyncStatus>((resolve) => {
        ipcMain.emit('vandashi:async-status', undefined, resolve);
      }),
  );
}
