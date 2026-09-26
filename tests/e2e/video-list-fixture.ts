import type { ElectronApplication } from '@playwright/test';
import type { AppEvent, Scope, VideoSummary } from '../../src/domain/models';
import { chatFixtureData } from './chat-fixture-data';
import { AppFault, failureEnvelope } from '../../src/domain/diagnostics';

interface Control {
  list?: 'first' | 'last' | 'fail';
  open?: 'success' | 'fail';
  refresh?: { thumbnail?: string | null; empty?: boolean };
  thumbnail?: { path: string; url?: string; fail?: boolean };
}
interface Observation {
  lists: number;
  pendingLists: number;
  thumbnails: string[];
  pendingThumbnails: string[];
  opened: Scope[];
  pendingOpens: number;
  created: { name: string; ratio: string }[];
}

export async function installVideoListFixture(
  desktop: ElectronApplication,
  options: {
    name?: string;
    thumbnail?: string;
    theme?: string;
    delayOpen?: boolean;
    secondVideo?: boolean;
    creation?: 'saved-error' | 'before-error' | 'success';
  } = {},
): Promise<void> {
  const brand = chatFixtureData(false, {});
  const video = chatFixtureData(true, {}).workspace.video;
  if (!video) throw new Error('Video fixture missing');
  video.name = options.name ?? 'Review video';
  video.updatedAt = '2026-09-23T10:00:00Z';
  video.packaging.thumbnails = options.thumbnail ? [options.thumbnail] : [];
  video.packaging.theme = options.theme ?? '';
  await desktop.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1200, 720);
      let workspace = fixture.brand.workspace;
      let videos: VideoSummary[] = [fixture.video];
      if (fixture.secondVideo) videos.push({ ...fixture.video, id: 'second-video', name: 'Another video' });
      let lists = 0;
      const opened: Scope[] = [];
      const created: { name: string; ratio: string }[] = [];
      const thumbnails: string[] = [];
      const pendingLists: { resolve: () => void; reject: () => void }[] = [];
      const pendingOpens: ((fail: boolean) => void)[] = [];
      const pendingThumbnails: {
        path: string;
        resolve: (url: string) => void;
        reject: (error: Error) => void;
      }[] = [];
      ipcMain.on('vandashi:video-list-observation', (_event, reply: (value: Observation) => void) => {
        reply({
          lists,
          pendingLists: pendingLists.length,
          thumbnails,
          pendingThumbnails: pendingThumbnails.map(({ path }) => path),
          opened,
          pendingOpens: pendingOpens.length,
          created,
        });
      });
      ipcMain.on('vandashi:video-list-control', (_event, control: Control) => {
        if (control.open) pendingOpens.shift()?.(control.open === 'fail');
        if (control.refresh) {
          if (control.refresh.empty) videos = [];
          else {
            const thumbnails =
              control.refresh.thumbnail === undefined
                ? fixture.video.packaging.thumbnails
                : control.refresh.thumbnail === null
                  ? []
                  : [control.refresh.thumbnail];
            videos = [{ ...fixture.video, packaging: { ...fixture.video.packaging, thumbnails } }];
          }
          workspace = { ...workspace, revision: `${workspace.revision}-next` };
          const event: AppEvent = { type: 'workspace-changed', scope: workspace.scope };
          BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
        }
        if (control.list) {
          const pending = control.list === 'last' ? pendingLists.pop() : pendingLists.shift();
          if (!pending) throw new Error('No pending list');
          if (control.list === 'fail') pending.reject();
          else pending.resolve();
        }
        if (control.thumbnail) {
          const requested = control.thumbnail;
          const index = pendingThumbnails.findIndex(({ path }) => path === requested.path);
          const pending = pendingThumbnails.splice(index, 1)[0];
          if (index < 0 || !pending) throw new Error('No pending thumbnail');
          if (requested.fail) pending.reject(new Error('Thumbnail is missing'));
          else pending.resolve(requested.url ?? '');
        }
      });
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
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
        if (method === 'getState') return fixture.brand.state;
        if (method === 'models') return fixture.brand.models;
        if (method === 'sessions') return [];
        if (method === 'checks')
          return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'openBrand') return workspace;
        if (method === 'createVideo' && fixture.creation) {
          const input = args[0] as { name: string; ratio: '16:9' | '9:16' };
          created.push({ name: input.name, ratio: input.ratio });
          if (fixture.creation === 'before-error') throw new Error('Creation preparation failed');
          const video = { ...fixture.video, id: 'saved-video', name: input.name, ratio: input.ratio };
          videos.push(video);
          if (fixture.creation === 'saved-error') return fixture.savedError;
          return { ...workspace, scope: { ...workspace.scope, videoId: video.id }, video };
        }
        if (method === 'openWorkspace') {
          const scope = args[0] as Scope;
          if (scope.videoId) {
            opened.push(scope);
            const result = {
              ...workspace,
              scope,
              video: videos.find((video) => video.id === scope.videoId) ?? fixture.video,
            };
            if (!fixture.delayOpen) return result;
            return new Promise((resolve, reject) => {
              pendingOpens.push((fail) => {
                if (fail) reject(new Error('Video workspace is temporarily unavailable'));
                else resolve(result);
              });
            });
          }
          return workspace;
        }
        if (method === 'listVideos') {
          lists++;
          const snapshot = structuredClone(videos);
          return new Promise<VideoSummary[]>((resolve, reject) => {
            pendingLists.push({
              resolve: () => {
                resolve(snapshot);
              },
              reject: () => {
                reject(new Error('Video library is temporarily unavailable'));
              },
            });
          });
        }
        if (method === 'mediaUrl') {
          const path = args[0] as string;
          thumbnails.push(path);
          return new Promise<string>((resolve, reject) => {
            pendingThumbnails.push({ path, resolve, reject });
          });
        }
        throw new Error(`Unexpected video list method: ${method}`);
      });
    },
    {
      brand,
      video,
      delayOpen: options.delayOpen ?? false,
      secondVideo: options.secondVideo ?? false,
      creation: options.creation,
      savedError: failureEnvelope(
        new AppFault({
          id: 'storageCreatedVideoUnavailable',
          params: { path: '/tmp/chat-test/videos/saved-video' },
        }),
      ),
    },
  );
}

export async function videoListControl(desktop: ElectronApplication, control: Control): Promise<void> {
  await desktop.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:video-list-control', undefined, value);
  }, control);
}

export function videoListObservation(desktop: ElectronApplication): Promise<Observation> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<Observation>((resolve) => {
        ipcMain.emit('vandashi:video-list-observation', undefined, resolve);
      }),
  );
}
