import type { ElectronApplication } from '@playwright/test';
import type { SaveInput, Commit } from '../../src/domain/models';
import type { DesktopApi } from '../../src/domain/api';
import { chatFixtureData } from './chat-fixture-data';

type ScriptInput = Parameters<DesktopApi['saveScript']>[0];
interface Requests {
  saves: SaveInput[];
  scripts: ScriptInput[];
}
export async function installPackagingRegressionFixture(desktop: ElectronApplication, thumbnailCount = 1) {
  const fixture = chatFixtureData(true, { references: true });
  fixture.workspace.assets = [
    {
      id: 'image',
      path: '/tmp/chat-test/videos/video/video_assets/blue city.png',
      relativePath: 'blue city.png',
      title: 'Blue city',
      description: '',
      tags: [],
      kind: 'image',
      hash: '',
      revision: 'a'.repeat(64),
      size: 100,
      shared: false,
      mediaUrl: '',
    },
  ];
  if (!fixture.workspace.video) throw new Error('Missing video');
  fixture.workspace.video.packaging.thumbnails = Array.from(
    { length: thumbnailCount },
    (_, index) => `thumbnails/portrait-${String(index)}.svg`,
  );
  await desktop.evaluate(({ ipcMain, BrowserWindow }, data) => {
    let workspace = data.workspace;
    const requests: Requests = { saves: [], scripts: [] };
    const history: Commit[] = Array.from({ length: 26 }, (_, index) => ({
      sha: String(index).padStart(40, '0'),
      title: `Revision ${String(index)}`,
      body: 'Verified commit',
      date: '2026-09-23T12:00:00Z',
      files: [],
    }));
    const emit = () =>
      BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', {
        type: 'workspace-changed',
        scope: workspace.scope,
      });
    ipcMain.on('vandashi:packaging-requests', (_event, reply: (value: Requests) => void) => {
      reply(requests);
    });
    ipcMain.on('vandashi:packaging-new-commit', () => {
      const template = history[0];
      if (!template) throw new Error('Missing history');
      history.unshift({ ...template, sha: 'f'.repeat(40), title: 'Record rendered output' });
      // Render manifests change HEAD and history without changing the source/UI revision.
      workspace = { ...workspace };
      emit();
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
      if (method === 'getState') return data.state;
      if (method === 'models') return data.models;
      if (method === 'openBrand' || method === 'openWorkspace') return workspace;
      if (method === 'checks')
        return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
      if (method === 'sessions') return data.sessions;
      if (method === 'openChat') {
        const { topic } = args[0] as { topic: string };
        const session = data.sessions.find((entry) => entry.topic === topic);
        if (!session) throw new Error('Missing packaging fixture conversation');
        return structuredClone(session);
      }
      if (method === 'mediaUrl')
        return (
          'data:image/svg+xml,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"><rect width="300" height="600" fill="green"/></svg>',
          )
        );
      if (method === 'suggestCommit')
        return { title: 'Save reviewed packaging', body: 'Preserve titles and tags.' };
      if (method === 'saveWorkspace') {
        const input = args[0] as SaveInput;
        requests.saves.push(input);
        if (workspace.video && input.packaging)
          workspace = {
            ...workspace,
            video: { ...workspace.video, packaging: input.packaging },
            revision: workspace.revision + '-saved',
          };
        return workspace;
      }
      if (method === 'saveScript') {
        requests.scripts.push(args[0] as ScriptInput);
        throw new Error('Fixture AI unavailable; retain the reviewed script draft.');
      }
      if (method === 'history') {
        const { page } = args[0] as { page: number };
        return {
          commits: history.slice(page * 12, page * 12 + 12),
          hasMore: history.length > (page + 1) * 12,
        };
      }
      if (method === 'startStudio') return { url: 'about:blank', previewUrl: 'about:blank' };
      throw new Error(`Unexpected packaging fixture method ${method}`);
    });
  }, fixture);
}
export function packagingRequests(desktop: ElectronApplication): Promise<Requests> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<Requests>((resolve) => {
        ipcMain.emit('vandashi:packaging-requests', undefined, resolve);
      }),
  );
}
export async function addRenderCommit(desktop: ElectronApplication) {
  await desktop.evaluate(({ ipcMain }) => {
    ipcMain.emit('vandashi:packaging-new-commit');
  });
}
