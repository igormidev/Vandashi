import type { ElectronApplication } from '@playwright/test';
import type { AppEvent, ModelInfo, Settings } from '../../src/domain/models';
import type { ChatUsage } from '../../src/domain/chat-usage';
import type { ChatSkill } from '../../src/domain/chat-skills';
import { chatFixtureData } from './chat-fixture-data';

export async function installChatUsageFixture(
  app: ElectronApplication,
  usage: ChatUsage,
  models?: ModelInfo[],
) {
  await app.evaluate(
    ({ ipcMain, BrowserWindow }, fixture) => {
      let state = fixture.state;
      let usage = fixture.usage;
      let compacting: (() => void) | undefined;
      let calls = 0;
      let cancels = 0;
      let skillCalls = 0;
      let skillsHold = false;
      let skillFailure = false;
      const skills: ChatSkill[] = [
        { name: 'hyperframes', description: 'Enabled studio creation skill' },
        { name: 'vandashi-create-assets', description: 'Enabled asset generation skill' },
      ];
      const pendingSkills = new Set<(value: ChatSkill[]) => void>();
      const emit = (event: AppEvent) =>
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.on(
        'vandashi:usage-test',
        (
          _event,
          action: {
            complete?: boolean;
            usage?: ChatUsage;
            queued?: boolean;
            event?: AppEvent;
            skillsHold?: boolean;
            skillsComplete?: boolean;
            skillsFail?: boolean;
          },
        ) => {
          if (action.skillsHold !== undefined) skillsHold = action.skillsHold;
          if (action.skillsFail !== undefined) skillFailure = action.skillsFail;
          if (action.skillsComplete) {
            skillsHold = false;
            for (const resolve of pendingSkills) resolve(skills);
            pendingSkills.clear();
          }
          if (action.complete) compacting?.();
          if (action.usage) usage = action.usage;
          if (action.event) emit(action.event);
          if (action.queued !== undefined)
            emit({
              type: 'chat-queue',
              sessionId: 'chat-one',
              entries: action.queued
                ? [
                    {
                      id: '6694e40a-aa22-415e-80dd-6ea09d683657',
                      failed: true,
                      request: {
                        sessionId: 'chat-one',
                        text: 'Held request',
                        mode: 'read',
                        selection: fixture.state.settings.chat,
                        attachments: [],
                      },
                    },
                  ]
                : [],
            });
        },
      );
      ipcMain.on('vandashi:usage-calls', (_event, reply: (value: number) => void) => {
        reply(calls);
      });
      ipcMain.on('vandashi:usage-cancel-calls', (_event, reply: (value: number) => void) => {
        reply(cancels);
      });
      ipcMain.on('vandashi:skills-calls', (_event, reply: (value: number) => void) => {
        reply(skillCalls);
      });
      ipcMain.handle('vandashi:invoke', (_event, method: string, [input]: unknown[]) => {
        if (method === 'getState') return state;
        if (method === 'getUpdateState') return fixture.updateState;
        if (method === 'models') return fixture.models;
        if (method === 'openBrand' || method === 'openWorkspace') return fixture.workspace;
        if (method === 'prepareTranscriptions') return { status: 'ready' };
        if (method === 'sessions') return fixture.sessions;
        if (method === 'pendingChatInput') return null;
        if (method === 'queuedChats') return [];
        if (method === 'installedBrowsers') return [];
        if (method === 'chooseFiles') return ['/selection-only/stashed.txt'];
        if (method === 'checks')
          return [{ id: 'Codex', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'settings') {
          state = { ...state, settings: input as Settings };
          return;
        }
        if (method === 'openChat') {
          const request = input as { topic: string };
          return fixture.sessions.find((entry) => entry.topic === request.topic);
        }
        if (method === 'chatUsage') return usage;
        if (method === 'chatSkills') {
          skillCalls++;
          if (skillFailure) throw new Error('Native skill discovery unavailable');
          if (skillsHold)
            return new Promise<ChatSkill[]>((resolve) => {
              pendingSkills.add(resolve);
            });
          return skills;
        }
        if (method === 'cancelChat') {
          cancels++;
          return;
        }
        if (method === 'compactChat') {
          calls++;
          emit({ type: 'activity', activity: { sessionId: 'chat-one', phase: 'working', detail: '' } });
          return new Promise<void>((resolve) => {
            compacting = () => {
              compacting = undefined;
              emit({ type: 'activity', activity: { sessionId: 'chat-one', phase: 'done', detail: '' } });
              resolve();
            };
          });
        }
        throw new Error(`Unexpected usage fixture method ${method}`);
      });
    },
    { ...chatFixtureData(false, models ? { models } : {}), usage },
  );
}

export async function usageControl(
  app: ElectronApplication,
  action: {
    complete?: boolean;
    usage?: ChatUsage;
    queued?: boolean;
    event?: AppEvent;
    skillsHold?: boolean;
    skillsComplete?: boolean;
    skillsFail?: boolean;
  },
) {
  await app.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:usage-test', {}, value);
  }, action);
}
export function skillCalls(app: ElectronApplication): Promise<number> {
  return app.evaluate(
    ({ ipcMain }) =>
      new Promise<number>((resolve) => {
        ipcMain.emit('vandashi:skills-calls', {}, resolve);
      }),
  );
}
export function compactCalls(app: ElectronApplication): Promise<number> {
  return app.evaluate(
    ({ ipcMain }) =>
      new Promise<number>((resolve) => {
        ipcMain.emit('vandashi:usage-calls', {}, resolve);
      }),
  );
}
export function cancelCalls(app: ElectronApplication): Promise<number> {
  return app.evaluate(
    ({ ipcMain }) =>
      new Promise<number>((resolve) => {
        ipcMain.emit('vandashi:usage-cancel-calls', {}, resolve);
      }),
  );
}
