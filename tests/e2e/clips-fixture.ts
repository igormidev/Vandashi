import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ElectronApplication } from '@playwright/test';
import type { DesktopApi } from '../../src/domain/api';
import type { AppEvent, ChatSession, SaveInput, Scope, Workspace } from '../../src/domain/models';
import { appMessagesEn } from '../../src/domain/messages';
import { chatFixtureData } from './chat-fixture-data';

export async function installClipsFixture(
  desktop: ElectronApplication,
  failCreation: 'none' | 'before' | 'after' | 'after-open' = 'none',
  imported = false,
) {
  const directory = await desktop.evaluate(({ app }) => app.getPath('userData'));
  const source = join(process.cwd(), 'tests/fixtures/chapter-video.mp4');
  const mediaPaths = {
    source,
    square: join(directory, 'square.mp4'),
    portrait: join(directory, 'portrait.mp4'),
  };
  const execute = promisify(execFile);
  for (const [name, filter] of [
    ['square', 'crop=ih:ih,scale=180:180'],
    ['portrait', 'crop=ih*9/16:ih,scale=90:160'],
  ] as const) {
    await execute('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      source,
      '-t',
      '2',
      '-vf',
      filter,
      '-an',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      mediaPaths[name],
    ]);
  }
  await desktop.evaluate(
    ({ ipcMain, BrowserWindow, protocol, net }, fixture) => {
      const parent = fixture.workspace;
      let state = fixture.state;
      const workspaces = new Map<string, Workspace>();
      const sessions: ChatSession[] = [];
      const requests: { method: string; input: unknown }[] = [];
      let fail = fixture.failCreation;
      let failOpening = fixture.failCreation === 'after-open';
      let active = '';
      const key = (scope: Scope) => scope.clipId ?? 'parent';
      workspaces.set('parent', parent);
      if (fixture.imported) {
        const clip = {
          ...fixture.clip,
          origin: 'imported' as const,
          id: 'created-clip',
          name: 'Finished excerpt',
        };
        const scope = { ...parent.scope, clipId: clip.id };
        workspaces.set('parent', { ...parent, clips: [clip] });
        workspaces.set(clip.id, { ...parent, scope, video: clip, revision: 'imported-one', clips: [] });
      }
      const emit = (event: AppEvent) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
      const finish = (cancelled = false) => {
        const session = sessions.find((entry) => entry.id === active);
        if (!session) throw new Error('No active clip turn');
        session.messages.push({
          id: 'clip-final',
          role: cancelled ? 'error' : 'assistant',
          text: cancelled ? 'Stopped; your clip files were preserved.' : 'The first clip is ready.',
          turnId: 'clip-turn',
          files: [],
          createdAt: '',
        });
        emit({
          type: 'activity',
          activity: { sessionId: active, phase: cancelled ? 'error' : 'done', detail: '' },
        });
        emit({ type: 'workspace-changed', scope: session.scope });
        active = '';
      };
      protocol.unhandle('vandashi-media');
      protocol.handle('vandashi-media', (request) => {
        const kind = new URL(request.url).pathname.slice(1);
        const path =
          kind === 'square'
            ? fixture.mediaPaths.square
            : kind === 'portrait'
              ? fixture.mediaPaths.portrait
              : fixture.mediaPaths.source;
        return net.fetch(`file://${path}`);
      });
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.on('vandashi:clips-finish', () => {
        finish();
      });
      ipcMain.on('vandashi:clips-requests', (_event, reply: (value: typeof requests) => void) => {
        reply(requests);
      });
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        const input = args[0];
        requests.push({ method, input });
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
        if (method === 'settings') {
          state = { ...state, settings: input as Parameters<DesktopApi['settings']>[0] };
          return;
        }
        if (method === 'models') return fixture.models;
        if (method === 'checks')
          return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'openBrand') return workspaces.get('parent');
        if (method === 'openWorkspace') {
          if ((input as Scope).clipId && failOpening) {
            failOpening = false;
            throw new Error('The saved clip could not be opened yet.');
          }
          return workspaces.get(key(input as Scope));
        }
        if (method === 'mediaUrl') {
          const clip = workspaces.get('created-clip')?.video;
          return `vandashi-media://local/${input === clip?.renderedPath ? (clip?.ratio === '1:1' ? 'square' : 'portrait') : 'source'}`;
        }
        if (method === 'listVideos') return [parent.video];
        if (method === 'history') return { commits: [], hasMore: false };
        if (method === 'studioChanges') return { dirty: false, files: [] };
        if (method === 'startStudio')
          return {
            url: 'http://127.0.0.1:65530/#project/fixture',
            previewUrl: 'http://127.0.0.1:65530/preview',
            projectPath: '/tmp/clip-fixture',
          };
        if (method === 'sessions')
          return structuredClone(sessions.filter((session) => key(session.scope) === key(input as Scope)));
        if (method === 'openChat') {
          const request = input as Parameters<DesktopApi['openChat']>[0];
          let session = sessions.find(
            (entry) => key(entry.scope) === key(request.scope) && entry.topic === request.topic,
          );
          if (!session) {
            session = {
              id: `${key(request.scope)}:${request.topic}`,
              scope: request.scope,
              topic: request.topic,
              title: request.title,
              threadId: null,
              messages: [],
              open: true,
              updatedAt: '',
            };
            sessions.push(session);
          }
          session.open = true;
          return structuredClone(session);
        }
        if (method === 'closeChat') {
          const session = sessions.find((entry) => entry.id === input);
          if (session) session.open = false;
          return;
        }
        if (method === 'sendChat') {
          const request = input as Parameters<DesktopApi['sendChat']>[0];
          const session = sessions.find((entry) => entry.id === request.sessionId);
          if (!session) throw new Error('Missing clip session');
          const message = {
            id: `retry-${String(session.messages.length)}`,
            role: 'user' as const,
            text: request.text,
            ...(request.handoff
              ? { appMessage: request.handoff.message, userText: request.handoff.guidance }
              : {}),
            turnId: 'retry-turn',
            files: [],
            createdAt: '',
          };
          session.messages.push(message);
          emit({ type: 'chat', sessionId: session.id, message, delta: false });
          return;
        }
        if (method === 'cancelChat') {
          finish(true);
          return;
        }
        if (method === 'suggestCommit')
          return { title: 'Review clip title', body: 'Save the selected clip packaging only.' };
        if (method === 'saveWorkspace') {
          const request = input as SaveInput;
          const workspace = workspaces.get(key(request.scope));
          if (!workspace?.video || !request.packaging || request.revision !== workspace.revision)
            throw new Error('Invalid clip save');
          const packaging = request.packaging;
          const updated = {
            ...workspace,
            video: { ...workspace.video, packaging: request.packaging },
            revision: `${workspace.revision}-saved`,
          };
          workspaces.set(key(request.scope), updated);
          const original = workspaces.get('parent');
          if (original)
            workspaces.set('parent', {
              ...original,
              clips: original.clips.map((clip) =>
                clip.id === request.scope.clipId ? { ...clip, packaging } : clip,
              ),
            });
          return updated;
        }
        if (method === 'createClip') {
          if (fail === 'before') {
            fail = 'none';
            throw new Error('Clip preparation failed. Retry your selection.');
          }
          const request = input as Parameters<DesktopApi['createClip']>[0];
          const clip = {
            ...fixture.clip,
            id: 'created-clip',
            name: request.name,
            ratio: request.ratio,
            start: request.start,
            end: request.end,
          };
          const scope = { ...request.scope, clipId: clip.id };
          workspaces.set('parent', { ...parent, clips: [clip] });
          workspaces.set(clip.id, { ...parent, scope, video: clip, revision: 'clip-one', clips: [] });
          if (fail === 'after' || fail === 'after-open') {
            fail = 'none';
            return {
              clip,
              generation: {
                status: 'failed',
                diagnostic: { kind: 'external', text: 'Codex could not start.' },
                handoff: {
                  message: {
                    id: 'clipHandoff',
                    params: { ratio: request.ratio, start: request.start, end: request.end },
                  },
                  guidance: request.prompt,
                },
              },
            };
          }
          active = `${clip.id}:clip`;
          sessions.push({
            id: active,
            scope,
            topic: 'clip',
            title: request.name,
            threadId: 'clip-thread',
            messages: [
              {
                id: 'clip-request',
                role: 'user',
                text: fixture.handoffTemplate
                  .replace('{{ratio}}', request.ratio)
                  .replace('{{start}}', String(request.start))
                  .replace('{{end}}', String(request.end)),
                appMessage: {
                  id: 'clipHandoff',
                  params: { ratio: request.ratio, start: request.start, end: request.end },
                },
                userText: request.prompt,
                turnId: 'clip-turn',
                files: [],
                createdAt: '',
              },
              {
                id: 'clip-reasoning',
                role: 'reasoning',
                text: 'Choosing the requested moment and preserving its context.',
                turnId: 'clip-turn',
                files: [],
                createdAt: '',
              },
            ],
            open: true,
            updatedAt: '',
          });
          emit({ type: 'activity', activity: { sessionId: active, phase: 'working', detail: '' } });
          return { clip, generation: { status: 'started' } };
        }
        throw new Error(`Unexpected clips fixture method ${method}`);
      });
    },
    {
      ...chatFixtureData(true, {}),
      mediaPaths,
      failCreation,
      imported,
      handoffTemplate: appMessagesEn.clipHandoff,
    },
  );
}

export async function finishClip(desktop: ElectronApplication): Promise<void> {
  await desktop.evaluate(({ ipcMain }) => {
    ipcMain.emit('vandashi:clips-finish');
  });
}

export function clipRequests(desktop: ElectronApplication): Promise<{ method: string; input: unknown }[]> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<{ method: string; input: unknown }[]>((resolve) => {
        ipcMain.emit('vandashi:clips-requests', undefined, resolve);
      }),
  );
}
