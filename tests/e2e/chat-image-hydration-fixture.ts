import type { ElectronApplication } from '@playwright/test';
import { chatFixtureData } from './chat-fixture-data';

interface ImageHydrationStatus {
  opens: number;
  lookups: number;
  rejectedLookups: number;
  pending: boolean;
}

export async function installImageHydrationFixture(desktop: ElectronApplication, path: string, url: string) {
  const fixture = chatFixtureData(false, {});
  const first = fixture.sessions[0];
  if (!first) throw new Error('Missing saved conversation');
  first.messages.push(
    {
      id: 'saved-generated-image',
      role: 'tool',
      text: 'Saved image generation',
      turnId: 'image-turn',
      files: [],
      createdAt: '',
      generatedImages: [path],
    },
    {
      id: 'saved-markdown-image',
      role: 'assistant',
      text: `Saved thumbnail: ![Saved thumbnail](<${path}>)`,
      turnId: 'image-turn',
      files: [],
      createdAt: '',
    },
  );
  await desktop.evaluate(
    ({ ipcMain }, input) => {
      let granted = false;
      let release: ((success: boolean) => void) | null = null;
      let opens = 0;
      let lookups = 0;
      let rejectedLookups = 0;
      ipcMain.on('vandashi:image-hydration-release', (_event, success: boolean) => {
        if (!release) throw new Error('No history request is pending');
        const complete = release;
        release = null;
        complete(success);
      });
      ipcMain.on(
        'vandashi:image-hydration-status',
        (_event, reply: (value: ImageHydrationStatus) => void) => {
          reply({ opens, lookups, rejectedLookups, pending: release !== null });
        },
      );
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        if (method === 'getState') return input.fixture.state;
        if (method === 'models') return input.fixture.models;
        if (method === 'openBrand' || method === 'openWorkspace') return input.fixture.workspace;
        if (method === 'checks')
          return [{ id: 'Fixture', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'sessions') return structuredClone(input.fixture.sessions);
        if (method === 'openChat') {
          opens++;
          const request = args[0] as { topic: string };
          const session = input.fixture.sessions.find((entry) => entry.topic === request.topic);
          if (!session) throw new Error('Unknown conversation');
          if (session.id !== 'chat-one') return structuredClone(session);
          return new Promise((resolve, reject) => {
            release = (success) => {
              if (!success) {
                reject(new Error('History is offline; stored transcript remains available.'));
                return;
              }
              // Simulate the exact provider artifact becoming authorized when history hydration finishes.
              granted = true;
              resolve(structuredClone(session));
            };
          });
        }
        if (method === 'mediaUrl') {
          lookups++;
          if (!granted || args[0] !== input.path) {
            rejectedLookups++;
            throw new Error('The saved image has not been verified by provider history.');
          }
          return input.url;
        }
        throw new Error(`Unexpected image hydration method: ${method}`);
      });
    },
    { fixture, path, url },
  );
}

export function imageHydrationStatus(desktop: ElectronApplication): Promise<ImageHydrationStatus> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<ImageHydrationStatus>((resolve) => {
        ipcMain.emit('vandashi:image-hydration-status', undefined, resolve);
      }),
  );
}

export async function releaseImageHistory(desktop: ElectronApplication, success: boolean) {
  await desktop.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:image-hydration-release', undefined, value);
  }, success);
}
