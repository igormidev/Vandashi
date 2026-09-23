import type { ElectronApplication } from '@playwright/test';
import type { DesktopApi } from '../../src/domain/api';
import type { AppEvent, Scope, StudioInfo, Workspace } from '../../src/domain/models';
import { chatFixtureData } from './chat-fixture-data';

type ScriptInput = Parameters<DesktopApi['saveScript']>[0];
interface Control {
  refresh?: { revision?: string; clip?: boolean };
  read?: 'first' | 'last' | 'all' | 'fail';
  studio?: boolean;
  acknowledge?: boolean;
  complete?: boolean;
}
interface Observation {
  starts: Scope[];
  rejectedStarts: number;
  reads: number;
  pendingReads: number;
  scripts: ScriptInput[];
}

/** Hold independent IPC responses and the Studio lease to expose refresh-order races. */
export async function installCreationRefreshFixture(
  desktop: ElectronApplication,
  rendererUrl: string,
  original = '# Original script\n',
) {
  await desktop.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      let workspace = fixture.data.workspace;
      workspace.documents = [
        {
          path: '/tmp/chat-test/videos/video/script.md',
          name: 'script.md',
          kind: 'script',
          content: fixture.original,
        },
      ];
      const sessions = fixture.data.sessions;
      sessions.push({
        id: 'creation',
        scope: workspace.scope,
        topic: 'creation',
        title: 'Creation workspace',
        threadId: null,
        messages: [],
        open: true,
        updatedAt: '',
      });
      const starts: Scope[] = [];
      const scripts: ScriptInput[] = [];
      const pendingReads: ((fail: boolean) => void)[] = [];
      let reads = 0;
      let rejectedStarts = 0;
      let holdReads = false;
      let active: 'studio' | 'script' | null = null;
      let releaseStudio: (() => void) | undefined;
      let acknowledge: (() => void) | undefined;
      const emit = (event: AppEvent) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
      const activity = (phase: 'working' | 'done') => {
        emit({ type: 'activity', activity: { sessionId: 'fixture-operation', phase, detail: '' } });
      };
      const snapshot = (scope: Scope): Workspace => {
        const video = scope.clipId
          ? (workspace.clips.find((entry) => entry.id === scope.clipId) ?? null)
          : workspace.video;
        return structuredClone({ ...workspace, scope, video });
      };
      ipcMain.on('vandashi:creation-observation', (_event, reply: (value: Observation) => void) => {
        reply({ starts, rejectedStarts, reads, pendingReads: pendingReads.length, scripts });
      });
      ipcMain.on('vandashi:creation-control', (_event, action: Control) => {
        if (action.studio) releaseStudio?.();
        if (action.acknowledge) acknowledge?.();
        if (action.complete) {
          active = null;
          activity('done');
        }
        if (action.refresh) {
          holdReads = true;
          if (action.refresh.revision) workspace = { ...workspace, revision: action.refresh.revision };
          emit({
            type: 'workspace-changed',
            scope: { ...workspace.scope, clipId: action.refresh.clip ? 'clip-one' : null },
          });
        }
        if (action.read === 'first') pendingReads.shift()?.(false);
        if (action.read === 'last') pendingReads.pop()?.(false);
        if (action.read === 'all' || action.read === 'fail') {
          holdReads = false;
          for (const release of pendingReads.splice(0)) release(action.read === 'fail');
        }
      });
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        const input = args[0];
        if (method === 'getState') return fixture.data.state;
        if (method === 'settings') {
          fixture.data.state.settings = input as Parameters<DesktopApi['settings']>[0];
          return;
        }
        if (method === 'models') return fixture.data.models;
        if (method === 'openBrand') return workspace;
        if (method === 'checks')
          return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'openWorkspace') {
          reads++;
          const value = snapshot(input as Scope);
          if (!holdReads) return value;
          return new Promise((resolve) => {
            pendingReads.push((fail) => {
              resolve(
                fail
                  ? { __vandashiFailure: 'v1', diagnostic: { kind: 'external', text: 'Refresh failed' } }
                  : value,
              );
            });
          });
        }
        if (method === 'sessions') return sessions;
        if (method === 'openChat') {
          const request = input as Parameters<DesktopApi['openChat']>[0];
          const session = sessions.find((entry) => entry.topic === request.topic) ?? sessions[0];
          return { ...session, ...(active ? { historyDeferred: true } : {}) };
        }
        if (method === 'history') return { commits: [], hasMore: false };
        if (method === 'startStudio') {
          const scope = input as Scope;
          starts.push(scope);
          if (active) {
            rejectedStarts++;
            return {
              __vandashiFailure: 'v1',
              diagnostic: { kind: 'app', message: { id: 'appOperationBusy' } },
            };
          }
          active = 'studio';
          activity('working');
          const generation = starts.length;
          return new Promise((resolve) => {
            releaseStudio = () => {
              releaseStudio = undefined;
              active = null;
              activity('done');
              resolve({
                url: fixture.url + 'studio-test/editor.html',
                previewUrl: fixture.url + `studio-test/preview.html?generation=${String(generation)}`,
                projectPath: '/tmp/chat-test/videos/video',
              } satisfies StudioInfo);
            };
          });
        }
        if (method === 'saveScript') {
          scripts.push(input as ScriptInput);
          if (active) throw new Error('A fixture operation is still active');
          active = 'script';
          activity('working');
          return new Promise((resolve) => {
            acknowledge = () => {
              acknowledge = undefined;
              resolve(sessions.find((entry) => entry.topic === 'creation'));
            };
          });
        }
        throw new Error(`Unexpected creation refresh method: ${method}`);
      });
    },
    { data: chatFixtureData(true, { clips: true }), url: rendererUrl, original },
  );
}

export async function creationControl(desktop: ElectronApplication, action: Control) {
  await desktop.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:creation-control', undefined, value);
  }, action);
}

export function creationObservation(desktop: ElectronApplication): Promise<Observation> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<Observation>((resolve) => {
        ipcMain.emit('vandashi:creation-observation', undefined, resolve);
      }),
  );
}
