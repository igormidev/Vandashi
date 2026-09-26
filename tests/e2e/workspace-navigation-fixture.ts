import type { ElectronApplication } from '@playwright/test';
import type { DesktopApi } from '../../src/domain/api';
import type { AppEvent, ChatSession, Scope, Workspace } from '../../src/domain/models';
import { chatFixtureData } from './chat-fixture-data';

interface Control {
  hold?: boolean;
  holdClip?: boolean;
  release?: 'success' | 'failure';
  refresh?: boolean;
}
export interface NavigationObservation {
  pending: number;
  calls: { method: string; input: unknown }[];
}

export async function installNavigationFixture(
  application: ElectronApplication,
  parentImported = false,
  clipImported = false,
) {
  await application.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      if (!fixture.workspace.video) throw new Error('Missing fixture video');
      const clip = { ...fixture.clip, origin: fixture.clipImported ? 'imported' : 'composition' } as const;
      const parent: Workspace = {
        ...fixture.workspace,
        video: { ...fixture.workspace.video, origin: fixture.parentImported ? 'imported' : 'composition' },
        clips: [clip],
      };
      let child: Workspace = {
        ...parent,
        scope: { ...parent.scope, clipId: clip.id },
        video: clip,
        revision: 'clip-one',
      };
      const calls: NavigationObservation['calls'] = [];
      const pending: ((success: boolean) => void)[] = [];
      const sessions: ChatSession[] = [];
      let hold = false;
      let holdClip = false;
      let firstBrand = true;
      const emit = (event: AppEvent) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
      };
      ipcMain.on('vandashi:navigation-control', (_event, action: Control) => {
        if (action.hold !== undefined) hold = action.hold;
        if (action.holdClip !== undefined) holdClip = action.holdClip;
        if (action.release) pending.shift()?.(action.release === 'success');
        if (action.refresh) {
          child = { ...child, revision: `${child.revision}-refreshed` };
          emit({ type: 'workspace-changed', scope: child.scope });
        }
      });
      ipcMain.on('vandashi:navigation-observe', (_event, reply: (value: NavigationObservation) => void) => {
        reply({ pending: pending.length, calls });
      });
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        const input = args[0];
        calls.push({ method, input });
        if (method === 'prepareTranscriptions') return { status: 'ready' };
        if (method === 'prepareTranscriptionModel') return undefined;
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
        if (method === 'getState') return fixture.state;
        if (method === 'models') return fixture.models;
        if (method === 'settings') return;
        if (method === 'openBrand') {
          if (firstBrand) {
            firstBrand = false;
            return parent;
          }
          return { ...parent, scope: { ...parent.scope, videoId: null }, video: null, clips: [] };
        }
        if (method === 'openWorkspace') {
          const isClip = !!(input as Scope).clipId;
          if (!(isClip ? holdClip : hold)) return isClip ? child : parent;
          const snapshot = structuredClone(isClip ? child : parent);
          return new Promise<Workspace>((resolve, reject) => {
            pending.push((success) => {
              if (success) resolve(snapshot);
              else reject(new Error('Parent workspace could not be opened.'));
            });
          });
        }
        if (method === 'checks')
          return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'sessions')
          return structuredClone(
            sessions.filter((session) => session.scope.clipId === (input as Scope).clipId),
          );
        if (method === 'openChat') {
          const request = input as Parameters<DesktopApi['openChat']>[0];
          let session = sessions.find(
            (entry) => entry.topic === request.topic && entry.scope.clipId === request.scope.clipId,
          );
          if (!session) {
            session = {
              ...request,
              id: `${request.scope.clipId ?? 'parent'}:${request.topic}`,
              threadId: null,
              messages: [],
              open: true,
              updatedAt: '',
            };
            sessions.push(session);
          }
          return structuredClone(session);
        }
        if (method === 'history') return { commits: [], hasMore: false };
        if (method === 'studioChanges') return { dirty: false, files: [] };
        if (method === 'startStudio')
          return {
            url: 'http://127.0.0.1:65530/',
            previewUrl: 'http://127.0.0.1:65530/preview',
            projectPath: '/tmp/navigation-fixture',
          };
        if (method === 'mediaUrl')
          return `vandashi-media://local/file?path=${encodeURIComponent(String(input))}`;
        if (method === 'listVideos') return [parent.video];
        throw new Error(`Unexpected navigation fixture method ${method}`);
      });
    },
    { ...chatFixtureData(true, { clips: true }), parentImported, clipImported },
  );
}

export function navigationControl(application: ElectronApplication, action: Control) {
  return application.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:navigation-control', undefined, value);
  }, action);
}

export function navigationObservation(application: ElectronApplication): Promise<NavigationObservation> {
  return application.evaluate(
    ({ ipcMain }) =>
      new Promise<NavigationObservation>((resolve) => {
        ipcMain.emit('vandashi:navigation-observe', undefined, resolve);
      }),
  );
}
