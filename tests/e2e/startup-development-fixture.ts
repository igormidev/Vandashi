import type { ElectronApplication, Page } from '@playwright/test';
import type { DesktopApi } from '../../src/domain/api';
import type { AppEvent, SaveInput, Scope, StudioInfo, Workspace } from '../../src/domain/models';
import { chatFixtureData } from './chat-fixture-data';
import { expect, probeUrl } from './development-fixtures';

type Gated = 'checks' | 'startStudio' | 'suggestCommit';
export interface StartupCall {
  method: string;
  input: unknown;
}
interface Control {
  release?: Gated;
  fail?: boolean;
  refresh?: boolean;
  studioDirty?: boolean;
}

export async function installStartupFixture(
  desktop: ElectronApplication,
  url: string,
  holdChecks = false,
  video = true,
) {
  await desktop.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      let workspace = {
        ...fixture.data.workspace,
        clips: fixture.data.workspace.clips.map((clip) => ({ ...clip, renderedPath: null })),
      };
      const sessions = fixture.data.sessions;
      const calls: StartupCall[] = [];
      const pending = new Map<Gated, (failed: boolean) => void>();
      let active: Gated | null = null;
      let studioDirty = false;
      const emit = (event: AppEvent) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
      const forScope = (scope: Scope): Workspace => {
        if (!scope.clipId) return { ...workspace, scope };
        const clip = workspace.clips.find((entry) => entry.id === scope.clipId);
        if (!clip) throw new Error('Unknown fixture clip');
        return { ...workspace, scope, video: clip };
      };
      ipcMain.on('vandashi:startup-calls', (_event, reply: (value: StartupCall[]) => void) => {
        reply(calls);
      });
      ipcMain.on('vandashi:startup-control', (_event, action: Control) => {
        if (action.studioDirty !== undefined) studioDirty = action.studioDirty;
        if (action.refresh) {
          workspace = { ...workspace, revision: workspace.revision + '-refreshed' };
          emit({ type: 'workspace-changed', scope: workspace.scope });
        }
        if (action.release) pending.get(action.release)?.(action.fail ?? false);
      });
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        const input = args[0];
        calls.push({ method, input });
        if (method === 'getState') return fixture.data.state;
        if (method === 'models') return fixture.data.models;
        if (method === 'openBrand') return workspace;
        if (method === 'openWorkspace') return forScope(input as Scope);
        if (method === 'sessions')
          return sessions.filter((session) => session.scope.clipId === (input as Scope).clipId);
        if (method === 'openChat') {
          const request = input as Parameters<DesktopApi['openChat']>[0];
          let session = sessions.find(
            (entry) => entry.topic === request.topic && entry.scope.clipId === request.scope.clipId,
          );
          if (!session) {
            session = {
              id: request.topic,
              topic: request.topic,
              title: request.title,
              scope: request.scope,
              threadId: null,
              messages: [],
              open: true,
              updatedAt: '',
            };
            sessions.push(session);
          }
          return { ...session, ...(active ? { historyDeferred: true } : {}) };
        }
        if (method === 'history') return { commits: [], hasMore: false };
        if (method === 'settings') return;
        if (method === 'studioChanges')
          return {
            dirty: studioDirty,
            files: studioDirty
              ? [{ path: 'index.html', additions: 1, deletions: 1, diff: '-Before\n+After' }]
              : [],
          };
        if (method === 'saveStudio') {
          studioDirty = false;
          workspace = { ...workspace, revision: workspace.revision + '-saved' };
          return workspace;
        }
        if (method === 'saveWorkspace') {
          const saved = input as SaveInput;
          if (saved.brandConfig)
            workspace = { ...workspace, brand: { ...workspace.brand, config: saved.brandConfig } };
          if (saved.packaging && workspace.video)
            workspace = {
              ...workspace,
              video: { ...workspace.video, packaging: saved.packaging },
              revision: workspace.revision + '-saved',
            };
          return workspace;
        }
        if (method === 'updateAsset') {
          const saved = input as Parameters<DesktopApi['updateAsset']>[0];
          workspace = {
            ...workspace,
            assets: workspace.assets.map((asset) =>
              asset.id === saved.assetId
                ? { ...asset, title: saved.title, description: saved.description, tags: saved.tags }
                : asset,
            ),
          };
          return workspace.assets.find((asset) => asset.id === saved.assetId);
        }
        if (method === 'checks' || method === 'startStudio' || method === 'suggestCommit') {
          if (active)
            return {
              __vandashiFailure: 'v1',
              diagnostic: { kind: 'app', message: { id: 'appOperationBusy' } },
            };
          const scope =
            method === 'checks'
              ? (input as Parameters<DesktopApi['checks']>[0]).scope
              : method === 'startStudio'
                ? (input as Scope)
                : (input as Parameters<DesktopApi['suggestCommit']>[0]).scope;
          const ready = [
            { id: 'Ready', status: 'ready' as const, detail: '', repairPrompt: null, helpUrl: null },
          ];
          if (method === 'checks' && !fixture.holdChecks) return ready;
          active = method;
          emit({ type: 'activity', activity: { sessionId: method, phase: 'working', detail: '' } });
          if (method === 'checks')
            emit({ type: 'checks', scope, video: true, checks: ready, progress: 1, current: 'Ready' });
          return new Promise((resolve) => {
            pending.set(method, (failed) => {
              pending.delete(method);
              active = null;
              emit({ type: 'activity', activity: { sessionId: method, phase: 'done', detail: '' } });
              if (failed) {
                resolve({
                  __vandashiFailure: 'v1',
                  diagnostic: { kind: 'external', text: 'Fixture startup failed' },
                });
                return;
              }
              if (method === 'checks') resolve(ready);
              if (method === 'suggestCommit')
                resolve({ title: 'Generated review title', body: 'Generated review explanation.' });
              if (method === 'startStudio')
                resolve({
                  url: fixture.url + 'studio-test/editor.html',
                  previewUrl: fixture.url + 'studio-test/preview.html',
                  projectPath: scope?.clipId
                    ? '/tmp/chat-test/videos/video/clips/excerpt'
                    : '/tmp/chat-test/videos/video',
                } satisfies StudioInfo);
            });
          });
        }
        throw new Error(`Unexpected startup fixture method ${method}`);
      });
    },
    {
      data: chatFixtureData(video, {
        clips: true,
        assets: [
          {
            id: 'artwork',
            path: '/tmp/chat-test/artwork.png',
            relativePath: 'artwork.png',
            title: 'Fixture artwork',
            description: '',
            tags: [],
            kind: 'image',
            size: 100,
            hash: 'a'.repeat(64),
            revision: 'a'.repeat(64),
            shared: !video,
            mediaUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=',
          },
        ],
      }),
      url,
      holdChecks,
    },
  );
}
export function startupCalls(desktop: ElectronApplication): Promise<StartupCall[]> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<StartupCall[]>((resolve) => {
        ipcMain.emit('vandashi:startup-calls', undefined, resolve);
      }),
  );
}
export async function startupControl(desktop: ElectronApplication, action: Control) {
  await desktop.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:startup-control', undefined, value);
  }, action);
}
export async function proveDevelopment(page: Page) {
  const result = await page.evaluate(async (path) => {
    const module: unknown = await import(path);
    if (
      !module ||
      typeof module !== 'object' ||
      !('development' in module) ||
      !('mode' in module) ||
      !('mount' in module) ||
      typeof module.mount !== 'function'
    )
      throw new Error('Missing development proof');
    Reflect.apply(module.mount, module, []);
    return { development: module.development, mode: module.mode };
  }, probeUrl);
  expect(result).toEqual({ development: true, mode: 'development' });
  await expect(page.getByTestId('strictmode-replay-proof')).toHaveAttribute('data-setups', '2');
  await expect(page.getByTestId('strictmode-replay-proof')).toHaveAttribute('data-cleanups', '1');
}
