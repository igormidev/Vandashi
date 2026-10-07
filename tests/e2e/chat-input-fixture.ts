import type { ElectronApplication } from '@playwright/test';
import type { AppEvent, QueuedChat, Settings } from '../../src/domain/models';
import type { ChatInputRequest, ChatInputResponse } from '../../src/domain/chat-input';
import { chatFixtureData } from './chat-fixture-data';

export interface InputFixtureControl {
  answer?: 'success' | 'failure';
  snapshot?: boolean;
  request?: ChatInputRequest | null;
  snapshotFailure?: boolean;
}

export async function installChatInputFixture(
  app: ElectronApplication,
  request: ChatInputRequest,
  options: {
    delayedAnswer?: boolean;
    delayedSnapshot?: boolean;
    initialQueue?: QueuedChat[];
    snapshotFailure?: boolean;
  } = {},
) {
  await app.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      let state = fixture.state;
      let pending: ChatInputRequest | null = fixture.request;
      let queue = fixture.options.initialQueue ?? [];
      const responses: ChatInputResponse[] = [];
      const snapshots: (() => void)[] = [];
      let snapshotFailure = fixture.options.snapshotFailure ?? false;
      let acknowledge: ((failed: boolean) => void) | undefined;
      const emit = (event: AppEvent) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
      const clear = () => {
        pending = null;
        emit({ type: 'chat-input', sessionId: fixture.request.sessionId, request: null });
      };
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.on('vandashi:input-test-control', (_event, value: InputFixtureControl) => {
        if (value.answer) acknowledge?.(value.answer === 'failure');
        if (value.snapshotFailure !== undefined) snapshotFailure = value.snapshotFailure;
        if (value.snapshot) for (const resolve of snapshots.splice(0)) resolve();
        if (Object.hasOwn(value, 'request')) {
          pending = value.request ?? null;
          emit({ type: 'chat-input', sessionId: fixture.request.sessionId, request: pending });
        }
      });
      ipcMain.on('vandashi:input-test-responses', (_event, reply: (value: ChatInputResponse[]) => void) => {
        reply(responses);
      });
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        const input = args[0];
        if (method === 'getState') return state;
        if (method === 'getUpdateState') return fixture.updateState;
        if (method === 'models') return fixture.models;
        if (method === 'openBrand' || method === 'openWorkspace') return fixture.workspace;
        if (method === 'prepareTranscriptions') return { status: 'ready' };
        if (method === 'sessions') return fixture.sessions;
        if (method === 'queuedChats') return queue;
        if (method === 'removeQueuedChat') {
          const value = input as { sessionId: string; id: string };
          queue = queue.filter((entry) => entry.id !== value.id);
          emit({ type: 'chat-queue', sessionId: value.sessionId, entries: structuredClone(queue) });
          return;
        }
        if (method === 'installedBrowsers') return [];
        if (method === 'checks')
          return [{ id: 'Codex', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'settings') {
          state = { ...state, settings: input as Settings };
          return;
        }
        if (method === 'openChat') {
          const value = input as { topic: string };
          return fixture.sessions.find((entry) => entry.topic === value.topic);
        }
        if (method === 'pendingChatInput') {
          if (input !== fixture.request.sessionId) return null;
          if (snapshotFailure) throw new Error('Pending input is temporarily unavailable.');
          emit({
            type: 'activity',
            activity: { sessionId: fixture.request.sessionId, phase: 'working', detail: '' },
          });
          const snapshot = structuredClone(pending);
          if (!fixture.options.delayedSnapshot) return snapshot;
          return new Promise((resolve) =>
            snapshots.push(() => {
              resolve(snapshot);
            }),
          );
        }
        if (method === 'respondChatInput') {
          const value = input as ChatInputResponse;
          responses.push(value);
          if (!fixture.options.delayedAnswer) {
            clear();
            return;
          }
          return new Promise<void>((resolve, reject) => {
            acknowledge = (failed) => {
              acknowledge = undefined;
              if (failed) reject(new Error('Connection interrupted; retry your exact answer.'));
              else {
                clear();
                resolve();
              }
            };
          });
        }
        if (method === 'cancelChat') {
          clear();
          return;
        }
        throw new Error(`Unexpected input fixture method ${method}`);
      });
    },
    { ...chatFixtureData(false, {}), request, options },
  );
}

export function inputControl(app: ElectronApplication, value: InputFixtureControl): Promise<void> {
  return app.evaluate(({ ipcMain }, action) => {
    ipcMain.emit('vandashi:input-test-control', undefined, action);
  }, value);
}
export function inputResponses(app: ElectronApplication): Promise<ChatInputResponse[]> {
  return app.evaluate(
    ({ ipcMain }) =>
      new Promise<ChatInputResponse[]>((resolve) => {
        ipcMain.emit('vandashi:input-test-responses', undefined, resolve);
      }),
  );
}
