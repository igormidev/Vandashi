import type { ElectronApplication } from '@playwright/test';
import type { AppEvent, AssetDraft, SaveInput, Settings } from '../../src/domain/models';
import { chatFixtureData, type ChatFixtureOptions } from './chat-fixture-data';

export async function installChatFixture(
  desktopApp: ElectronApplication,
  video = false,
  options: ChatFixtureOptions = {},
): Promise<void> {
  await desktopApp.evaluate(
    ({ ipcMain, BrowserWindow, protocol, net }, fixture) => {
      let data = fixture.state;
      let currentWorkspace = fixture.workspace;
      let prepared = 0;
      let failSend = false;
      let studioDirty = fixture.options.studioDirty ?? false;
      let releaseDiscard: ((fail: boolean) => void) | undefined;
      const sessions = fixture.sessions;
      const calls: string[] = [];
      const requests: unknown[] = [];
      ipcMain.removeHandler('vandashi:invoke');
      if (fixture.options.mediaPath) {
        const mediaPath = fixture.options.mediaPath;
        protocol.unhandle('vandashi-media');
        protocol.handle('vandashi-media', () => net.fetch(`file://${mediaPath}`));
      }
      const emit = (event: AppEvent) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
      };
      ipcMain.on(
        'vandashi:test-control',
        (
          _event,
          action: { event?: AppEvent; failSend?: boolean; reload?: boolean; discard?: 'success' | 'failure' },
        ) => {
          if (action.discard) releaseDiscard?.(action.discard === 'failure');
          if (action.failSend) failSend = true;
          if (action.reload) {
            currentWorkspace = { ...currentWorkspace, revision: `${currentWorkspace.revision}-new` };
            emit({ type: 'workspace-changed', scope: currentWorkspace.scope });
          }
          if (action.event) emit(action.event);
        },
      );
      ipcMain.on('vandashi:test-requests', (_event, reply: (value: unknown[]) => void) => {
        reply(requests);
      });
      ipcMain.on('vandashi:test-calls', (_event, reply: (value: string[]) => void) => {
        reply(calls);
      });
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        calls.push(method);
        const input = args[0];
        if (method === 'getState') return data;
        if (method === 'models') return fixture.models;
        if (method === 'openBrand' || method === 'openWorkspace') return currentWorkspace;
        if (method === 'checks')
          return [
            {
              id: 'Test fixture',
              status: fixture.options.checksFail ? 'error' : 'ready',
              detail: 'Deterministic renderer fixture',
              repairPrompt: null,
              helpUrl: null,
            },
          ];
        if (method === 'sessions') return structuredClone(sessions);
        if (method === 'openChat') {
          if (!input || typeof input !== 'object' || !('topic' in input)) throw new Error('Missing topic');
          const session = sessions.find((entry) => entry.topic === input.topic);
          if (!session) throw new Error('Unknown fixture conversation');
          session.open = true;
          return structuredClone(session);
        }
        if (method === 'resetChat') {
          const session = sessions.find((entry) => entry.id === input);
          if (!session) throw new Error('Missing conversation');
          session.messages = [];
          session.threadId = null;
          return structuredClone(session);
        }
        if (method === 'closeChat') {
          const session = sessions.find((entry) => entry.id === input);
          if (session) session.open = false;
          return;
        }
        if (method === 'settings') {
          data = { ...data, settings: input as Settings };
          requests.push({ method, input });
          return;
        }
        if (method === 'saveWorkspace') {
          const request = input as SaveInput;
          if (!request.commit.title.trim() || !request.commit.body.trim()) throw new Error('Empty commit');
          if (request.revision !== currentWorkspace.revision) throw new Error('Stale workspace');
          requests.push({ method, input });
          const brand = request.brandConfig
            ? { ...currentWorkspace.brand, config: request.brandConfig, name: request.brandConfig.name }
            : currentWorkspace.brand;
          currentWorkspace = {
            ...currentWorkspace,
            brand,
            video:
              currentWorkspace.video && request.packaging
                ? { ...currentWorkspace.video, packaging: request.packaging }
                : currentWorkspace.video,
            documents: currentWorkspace.documents.map((document) => {
              const update = request.documents.find((entry) => entry.path === document.path);
              return update ? { ...document, content: update.content } : document;
            }),
            revision: `${currentWorkspace.revision}-saved`,
          };
          return currentWorkspace;
        }
        if (method === 'sendChat') {
          requests.push(input);
          if (failSend) {
            failSend = false;
            throw new Error('Quota exhausted: try again after your usage resets.');
          }
          return;
        }
        if (method === 'preparePublish') {
          prepared++;
          if (
            !input ||
            typeof input !== 'object' ||
            !('platform' in input) ||
            typeof input.platform !== 'string' ||
            !('clipId' in input)
          )
            throw new Error('Missing platform');
          const topic = `publish:${input.platform}${typeof input.clipId === 'string' ? `:${input.clipId}` : ''}`;
          let session = sessions.find((entry) => entry.topic === topic);
          if (!session) {
            session = {
              id: topic,
              scope: currentWorkspace.scope,
              topic,
              title: input.platform,
              threadId: null,
              messages: [],
              open: true,
              updatedAt: '',
            };
            sessions.push(session);
          }
          session.open = true;
          return { session, prompt: `Prepared upload request ${String(prepared)}` };
        }
        if (method === 'generateChapters')
          return [
            { seconds: 0, title: 'Opening' },
            { seconds: 20, title: 'Middle' },
            { seconds: 40, title: 'Ending' },
          ];
        if (method === 'mediaUrl') return 'vandashi-media://local/chapter-video.mp4';
        if (method === 'assetWaveform')
          return Array.from({ length: 100 }, (_, index) => (index < 50 ? 0.25 : 0.8));
        if (method === 'chooseFiles')
          return [fixture.options.assetImportPath ?? fixture.options.mediaPath ?? '/tmp/imported.mp4'];
        if (method === 'suggestCommit') {
          if (fixture.options.commitFails) throw new Error('AI temporarily unavailable');
          return { title: 'Clarify asset metadata', body: 'Update the selected title and description.' };
        }
        if (method === 'describeAsset') {
          if (fixture.options.describeFails) throw new Error('AI temporarily unavailable');
          const request = input as { path: string };
          return {
            sourcePath: request.path,
            title: 'Generated image title',
            description: 'Generated image description',
            tags: ['brand'],
            kind: 'image',
          };
        }
        if (method === 'updateAsset') {
          const request = input as {
            assetId: string;
            title: string;
            description: string;
            tags: string[];
            commit?: { title: string; body: string };
          };
          if (!request.commit?.title || !request.commit.body)
            throw new Error('Metadata changes require a reviewed commit');
          const asset = currentWorkspace.assets.find((entry) => entry.id === request.assetId);
          if (!asset) throw new Error('Missing asset');
          const updated = {
            ...asset,
            title: request.title,
            description: request.description,
            tags: request.tags,
          };
          currentWorkspace = {
            ...currentWorkspace,
            assets: currentWorkspace.assets.map((entry) => (entry.id === asset.id ? updated : entry)),
            revision: `${currentWorkspace.revision}-metadata`,
          };
          return updated;
        }
        if (method === 'importAsset') {
          const request = input as { draft: AssetDraft };
          const asset = {
            id: 'imported-asset',
            path: request.draft.sourcePath,
            relativePath: 'imported.png',
            title: request.draft.title,
            description: request.draft.description,
            tags: request.draft.tags,
            kind: request.draft.kind,
            size: 10,
            hash: 'imported',
            shared: true,
            mediaUrl: '',
          };
          currentWorkspace = {
            ...currentWorkspace,
            assets: [...currentWorkspace.assets, asset],
            revision: `${currentWorkspace.revision}-import`,
          };
          return asset;
        }
        if (method === 'importFinishedClip') {
          currentWorkspace = { ...currentWorkspace, clips: [fixture.clip] };
          return fixture.clip;
        }
        if (method === 'updateLaunch') {
          if (
            !input ||
            typeof input !== 'object' ||
            !('launch' in input) ||
            !input.launch ||
            typeof input.launch !== 'object'
          )
            throw new Error('Invalid launch');
          const value = input.launch;
          if (
            !('platform' in value) ||
            !('status' in value) ||
            !('url' in value) ||
            typeof value.url !== 'string' ||
            !('clipId' in value) ||
            (value.clipId !== null && typeof value.clipId !== 'string')
          )
            throw new Error('Invalid launch');
          const platform = fixture.platforms.find((entry) => entry === value.platform);
          const status = fixture.statuses.find((entry) => entry === value.status);
          if (!platform || !status) throw new Error('Invalid status');
          const launch = { platform, status, url: value.url, clipId: value.clipId };
          currentWorkspace = {
            ...currentWorkspace,
            launches: [
              ...currentWorkspace.launches.filter(
                (entry) => !(entry.platform === platform && entry.clipId === launch.clipId),
              ),
              launch,
            ],
          };
          return;
        }
        if (method === 'history') {
          const request = input as { page: number };
          const history = fixture.options.history ?? [];
          return {
            commits: history.slice(request.page * 12, request.page * 12 + 12),
            hasMore: history.length > (request.page + 1) * 12,
          };
        }
        if (method === 'startStudio') return { url: 'about:blank' };
        if (method === 'studioChanges')
          return {
            dirty: studioDirty,
            files: studioDirty
              ? [{ path: 'index.html', additions: 1, deletions: 1, diff: '-white\n+mint' }]
              : [],
          };
        if (method === 'discardStudio') {
          if (!fixture.options.delayedDiscard) {
            studioDirty = false;
            return;
          }
          return new Promise<void>((resolve, reject) => {
            releaseDiscard = (fail) => {
              releaseDiscard = undefined;
              if (fail) reject(new Error('Test restore failure'));
              else {
                studioDirty = false;
                resolve();
              }
            };
          });
        }
        if (method === 'listVideos') return currentWorkspace.video ? [currentWorkspace.video] : [];
        if (method === 'cancelChat') {
          emit({ type: 'activity', activity: { sessionId: 'chat-one', phase: 'done', detail: '' } });
          return;
        }
        throw new Error(`Unexpected fixture method ${method}`);
      });
    },
    chatFixtureData(video, options),
  );
}
export async function chatControl(
  desktopApp: ElectronApplication,
  action: { event?: AppEvent; reload?: boolean; failSend?: boolean; discard?: 'success' | 'failure' },
): Promise<void> {
  await desktopApp.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:test-control', undefined, value);
  }, action);
}
export function chatCalls(desktopApp: ElectronApplication): Promise<string[]> {
  return desktopApp.evaluate(
    ({ ipcMain }) =>
      new Promise<string[]>((resolve) => {
        ipcMain.emit('vandashi:test-calls', undefined, resolve);
      }),
  );
}

export function chatRequests(desktopApp: ElectronApplication): Promise<unknown[]> {
  return desktopApp.evaluate(
    ({ ipcMain }) =>
      new Promise<unknown[]>((resolve) => {
        ipcMain.emit('vandashi:test-requests', undefined, resolve);
      }),
  );
}
