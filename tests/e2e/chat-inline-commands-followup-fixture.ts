import type { ElectronApplication } from '@playwright/test';
import type { AppEvent, ChatRequest, ModelInfo, Settings } from '../../src/domain/models';
import type { ChatSkill } from '../../src/domain/chat-skills';
import { chatFixtureData } from './chat-fixture-data';

export async function installInlineCommandFixture(app: ElectronApplication, models?: ModelInfo[]) {
  await app.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      let state = fixture.state;
      let skillsHold = false;
      let pickerHold = false;
      let pickerCalls = 0;
      let skillReads = 0;
      const skills: ChatSkill[] = [
        { name: 'hyperframes', description: 'Enabled studio skill' },
        { name: 'model', description: 'A provider skill sharing a local command name' },
      ];
      const pendingSkills = new Set<(value: ChatSkill[]) => void>();
      const pendingPickers = new Set<(value: string[]) => void>();
      const requests: ChatRequest[] = [];
      const emit = (event: AppEvent) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.on(
        'vandashi:inline-control',
        (_event, action: { skillsHold?: boolean; pickerHold?: boolean; event?: AppEvent }) => {
          if (action.skillsHold !== undefined) {
            skillsHold = action.skillsHold;
            if (!skillsHold) {
              for (const resolve of pendingSkills) resolve(skills);
              pendingSkills.clear();
            }
          }
          if (action.pickerHold !== undefined) {
            pickerHold = action.pickerHold;
            if (!pickerHold) {
              for (const resolve of pendingPickers) resolve(['/native/scene.png']);
              pendingPickers.clear();
            }
          }
          if (action.event) emit(action.event);
        },
      );
      ipcMain.on(
        'vandashi:inline-state',
        (
          _event,
          reply: (value: { requests: ChatRequest[]; pickerCalls: number; skillReads: number }) => void,
        ) => {
          reply({ requests, pickerCalls, skillReads });
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
        if (method === 'queuedChats' || method === 'installedBrowsers') return [];
        if (method === 'checks')
          return [{ id: 'Codex', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'chatUsage')
          return {
            context: null,
            account: { available: false, windows: [], checkedAt: '2026-10-08T12:00:00Z' },
          };
        if (method === 'mediaUrl')
          return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
        if (method === 'settings') {
          state = { ...state, settings: input as Settings };
          return;
        }
        if (method === 'openChat')
          return fixture.sessions.find((entry) => entry.topic === (input as { topic: string }).topic);
        if (method === 'chatSkills') {
          skillReads++;
          if (skillsHold)
            return new Promise<ChatSkill[]>((resolve) => {
              pendingSkills.add(resolve);
            });
          return skills;
        }
        if (method === 'chooseFiles') {
          pickerCalls++;
          if (pickerHold)
            return new Promise<string[]>((resolve) => {
              pendingPickers.add(resolve);
            });
          return ['/native/scene.png'];
        }
        if (method === 'sendChat') {
          requests.push(input as ChatRequest);
          throw new Error('Review the exact failed send snapshot');
        }
        throw new Error(`Unexpected inline command fixture method ${method}`);
      });
    },
    chatFixtureData(false, models ? { models } : {}),
  );
}
export function inlineControl(
  app: ElectronApplication,
  action: { skillsHold?: boolean; pickerHold?: boolean; event?: AppEvent },
) {
  return app.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:inline-control', {}, value);
  }, action);
}
export function inlineState(
  app: ElectronApplication,
): Promise<{ requests: ChatRequest[]; pickerCalls: number; skillReads: number }> {
  return app.evaluate(
    ({ ipcMain }) =>
      new Promise((resolve) => {
        ipcMain.emit('vandashi:inline-state', {}, resolve);
      }),
  );
}
