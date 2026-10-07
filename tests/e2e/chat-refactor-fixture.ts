import type { ElectronApplication } from '@playwright/test';
import type { AppEvent, ChatRequest, QueuedChat, Settings } from '../../src/domain/models';
import type { ChatControlAction } from './chat-controls';
import { chatFixtureData, type ChatFixtureOptions } from './chat-fixture-data';

interface RefactorOptions extends ChatFixtureOptions {
  observeLinkAccess?: boolean;
  initialQueue?: QueuedChat[];
  delayedQueueRemoval?: boolean;
  historyRewind?: { text: string; failRefreshOnce?: boolean };
}

/** Controlled renderer evidence; never substitutes for a real Codex round trip. */
export async function installChatRefactorFixture(app: ElectronApplication, options: RefactorOptions) {
  await app.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      let state = fixture.state;
      let queue = fixture.options.initialQueue ?? [];
      let sessions = fixture.sessions;
      let rewound = false;
      let refreshFailed = false;
      let releaseRemoval: ((failure: boolean) => void) | undefined;
      const requests: unknown[] = [];
      const emit = (event: AppEvent) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.on('vandashi:test-control', (_event, action: ChatControlAction) => {
        if (action.event) emit(action.event);
        if (action.queueRemoval) releaseRemoval?.(action.queueRemoval === 'failure');
      });
      ipcMain.on('vandashi:test-requests', (_event, reply: (value: unknown[]) => void) => {
        reply(requests);
      });
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        const input = args[0];
        if (fixture.options.observeLinkAccess && (method === 'filePreview' || method === 'openExternal')) {
          requests.push({ method, input });
          throw new Error('Chat source citations must not request native link access.');
        }
        if (method === 'getState') return state;
        if (method === 'getUpdateState') return fixture.updateState;
        if (method === 'models') return fixture.models;
        if (method === 'openBrand' || method === 'openWorkspace') {
          if (method === 'openWorkspace' && rewound) {
            requests.push({ method });
            if (fixture.options.historyRewind?.failRefreshOnce && !refreshFailed) {
              refreshFailed = true;
              throw new Error('Workspace refresh failed; retry the read.');
            }
          }
          return fixture.workspace;
        }
        if (method === 'prepareTranscriptions') return { status: 'ready' };
        if (method === 'sessions') return sessions;
        if (method === 'pendingChatInput') return null;
        if (method === 'chatSkills') return [];
        if (method === 'chatUsage')
          return {
            context: null,
            account: { available: false, windows: [], checkedAt: new Date().toISOString() },
          };
        if (method === 'queuedChats') return structuredClone(queue);
        if (method === 'checks')
          return [{ id: 'Codex', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'installedBrowsers') return [];
        if (method === 'settings') {
          state = { ...state, settings: input as Settings };
          return;
        }
        if (method === 'sendChat') {
          requests.push(input);
          return;
        }
        if (method === 'rewindChat' && fixture.options.historyRewind) {
          requests.push({ method, input });
          if (rewound) throw new Error('Rewind must not be repeated after a saved receipt.');
          const target = input as { sessionId: string; messageId: string };
          const session = sessions.find((entry) => entry.id === target.sessionId);
          if (!session) throw new Error('Missing target conversation');
          const index = session.messages.findIndex((entry) => entry.id === target.messageId);
          if (index < 0) throw new Error('Missing target message');
          const saved = { ...session, messages: session.messages.slice(0, index), checkpoints: [] };
          sessions = sessions.map((entry) => (entry.id === saved.id ? saved : entry));
          rewound = true;
          return {
            session: saved,
            draft: {
              text: fixture.options.historyRewind.text,
              mode: 'read',
              collaboration: 'plan',
              attachments: [],
            },
          };
        }
        if (method === 'openChat') {
          const request = input as { topic: string; sessionId?: string };
          return sessions.find(
            (entry) =>
              entry.topic === request.topic &&
              (request.sessionId ? entry.id === request.sessionId : !entry.branch),
          );
        }
        if (method === 'queueChat') {
          const request = input as ChatRequest;
          queue.push({ id: request.clientMessageId ?? crypto.randomUUID(), request, failed: false });
          requests.push({ method, input });
          emit({ type: 'chat-queue', sessionId: request.sessionId, entries: structuredClone(queue) });
          return;
        }
        if (method === 'removeQueuedChat') {
          const request = input as { sessionId: string; id: string };
          requests.push({ method, input });
          const remove = () => {
            queue = queue.filter((entry) => entry.id !== request.id);
            emit({ type: 'chat-queue', sessionId: request.sessionId, entries: structuredClone(queue) });
          };
          if (!fixture.options.delayedQueueRemoval) {
            remove();
            return;
          }
          return new Promise<void>((resolve, reject) => {
            releaseRemoval = (failure) => {
              releaseRemoval = undefined;
              if (failure) reject(new Error('Queue changed while editing; retry.'));
              else {
                remove();
                resolve();
              }
            };
          });
        }
        throw new Error(`Unexpected refactor fixture method ${method}`);
      });
    },
    { ...chatFixtureData(false, options), options },
  );
}
