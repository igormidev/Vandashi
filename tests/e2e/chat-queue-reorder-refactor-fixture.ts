import type { ElectronApplication } from '@playwright/test';
import type { AppEvent, QueuedChat, Settings } from '../../src/domain/models';
import type { QueuedChatOrder, QueuedChatRemoval } from '../../src/domain/chat-queue';
import { chatFixtureData } from './chat-fixture-data';

export const queueReorderIds = [
  '758ec7e2-63b4-4f8e-87a2-51e05a9ddc83',
  '1a512ef2-707f-4e74-ac2f-d2edba6cfbf2',
  'df518b8e-e0d7-4fdf-9215-24a59fc17c68',
];
export async function installQueueReorderFixture(app: ElectronApplication) {
  const data = chatFixtureData(false, {});
  const entries: QueuedChat[] = queueReorderIds.map((id, index) => ({
    id,
    failed: true,
    request: {
      sessionId: 'chat-one',
      clientMessageId: id,
      text: `Queued ${String(index + 1)} exact request`,
      mode: 'read',
      collaboration: 'plan',
      selection: { ...data.state.settings.chat, fast: index === 1 },
      attachments: [`/selection-only/request-${String(index + 1)}.png`],
    },
  }));
  await app.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      let entries = fixture.entries;
      let state = fixture.state;
      let completion: (() => void) | undefined;
      const calls: QueuedChatOrder[] = [];
      const removals: QueuedChatRemoval[] = [];
      let sends = 0;
      const emit = (event: AppEvent) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.on('vandashi:reorder-complete', () => {
        completion?.();
      });
      ipcMain.on(
        'vandashi:reorder-records',
        (
          _event,
          reply: (value: {
            calls: QueuedChatOrder[];
            removals: QueuedChatRemoval[];
            entries: QueuedChat[];
            sends: number;
          }) => void,
        ) => {
          reply({ calls, removals, entries, sends });
        },
      );
      ipcMain.handle('vandashi:invoke', (_event, method: string, [input]: unknown[]) => {
        if (method === 'getState') return state;
        if (method === 'getUpdateState') return fixture.updateState;
        if (method === 'models') return fixture.models;
        if (method === 'openBrand' || method === 'openWorkspace') return fixture.workspace;
        if (method === 'prepareTranscriptions') return { status: 'ready' };
        if (method === 'sessions') return fixture.sessions;
        if (method === 'pendingChatInput') return null;
        if (method === 'queuedChats') return entries.filter((entry) => entry.request.sessionId === input);
        if (method === 'installedBrowsers') return [];
        if (method === 'checks')
          return [{ id: 'Codex', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'settings') {
          state = { ...state, settings: input as Settings };
          return;
        }
        if (method === 'openChat')
          return fixture.sessions.find((entry) => entry.topic === (input as { topic: string }).topic);
        if (method === 'chatUsage')
          return {
            context: null,
            account: { available: false, windows: [], checkedAt: '2026-10-07T00:00:00Z' },
          };
        if (method === 'chatSkills') return [];
        if (method === 'sendChat' || method === 'queueChat') {
          sends++;
          return;
        }
        if (method === 'removeQueuedChat') {
          const removal = structuredClone(input) as QueuedChatRemoval;
          const entry = entries.find(
            (candidate) => candidate.id === removal.id && candidate.request.sessionId === removal.sessionId,
          );
          if (!entry || completion) throw new Error('Invalid reviewed removal');
          removals.push(removal);
          return new Promise<void>((resolve) => {
            completion = () => {
              completion = undefined;
              entries = entries.filter((candidate) => candidate !== entry);
              emit({ type: 'chat-pending', sessionId: removal.sessionId, id: removal.id, message: null });
              emit({ type: 'chat-queue', sessionId: removal.sessionId, entries });
              resolve();
            };
          });
        }
        if (method === 'reorderQueuedChat') {
          const order = structuredClone(input) as QueuedChatOrder;
          const current = entries.filter((entry) => entry.request.sessionId === order.sessionId);
          if (
            completion ||
            order.reviewedIds.some((id, index) => current[index]?.id !== id) ||
            order.ids.length !== current.length ||
            new Set(order.ids).size !== current.length ||
            order.ids.some((id) => !current.some((entry) => entry.id === id))
          )
            throw new Error('Invalid reviewed reorder');
          calls.push(order);
          return new Promise<void>((resolve) => {
            completion = () => {
              completion = undefined;
              entries = order.ids.flatMap((id) => current.filter((entry) => entry.id === id));
              emit({ type: 'chat-queue', sessionId: order.sessionId, entries });
              resolve();
            };
          });
        }
        throw new Error(`Unexpected reorder fixture method ${method}`);
      });
    },
    { ...data, entries },
  );
}
export async function finishReorder(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.emit('vandashi:reorder-complete');
  });
}
export function reorderRecords(app: ElectronApplication): Promise<{
  calls: QueuedChatOrder[];
  removals: QueuedChatRemoval[];
  entries: QueuedChat[];
  sends: number;
}> {
  return app.evaluate(
    ({ ipcMain }) =>
      new Promise((resolve) => {
        ipcMain.emit('vandashi:reorder-records', {}, resolve);
      }),
  );
}
