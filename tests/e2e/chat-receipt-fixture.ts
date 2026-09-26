import type { ElectronApplication } from '@playwright/test';
import type { DesktopApi } from '../../src/domain/api';
import type { ChatControlAction } from './chat-controls';
import { chatFixtureData } from './chat-fixture-data';

/** Models already-persisted history separately from live delivery; real Git/storage tests prove durability. */
export async function installReceiptFixture(desktop: ElectronApplication) {
  await desktop.evaluate(
    ({ ipcMain, BrowserWindow }, data) => {
      const sessions = data.sessions;
      ipcMain.on('vandashi:test-control', (_event, action: ChatControlAction) => {
        const event = action.event;
        if (!event) return;
        if (action.persistEvent && event.type === 'chat') {
          const session = sessions.find((entry) => entry.id === event.sessionId);
          if (!session) throw new Error('Unknown persistent fixture conversation');
          session.messages = [
            ...session.messages.filter((message) => message.id !== event.message.id),
            event.message,
          ];
        }
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
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
        if (method === 'getState') return data.state;
        if (method === 'models') return data.models;
        if (method === 'openBrand' || method === 'openWorkspace') return data.workspace;
        if (method === 'settings') return;
        if (method === 'checks')
          return [{ id: 'Fixture', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'sessions') return structuredClone(sessions);
        if (method === 'openChat') {
          const input = args[0] as Parameters<DesktopApi['openChat']>[0];
          return structuredClone(sessions.find((session) => session.topic === input.topic));
        }
        throw new Error(`Unexpected receipt fixture method ${method}`);
      });
    },
    chatFixtureData(false, {}),
  );
}
