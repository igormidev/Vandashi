import type { ElectronApplication } from '@playwright/test';
import type { IpcMainInvokeEvent } from 'electron';
import type { Diagnostic } from '../../src/domain/diagnostics';

interface RecoveryStatus {
  creates: { parentPath: string; name: string }[];
  opens: number;
  pickers: number;
  links: string[];
  pending: boolean;
}

export async function installBrandRecovery(
  desktop: ElectronApplication,
  directory: string,
  failure: Diagnostic,
  failOpen = false,
) {
  await desktop.evaluate(
    ({ ipcMain, dialog, shell }, input) => {
      type Handler = (event: IpcMainInvokeEvent, method: unknown, args: unknown) => unknown;
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
      const invoke = handlers.get('vandashi:invoke');
      if (!invoke) throw new Error('Missing production handler');
      const status: RecoveryStatus = { creates: [], opens: 0, pickers: 0, links: [], pending: false };
      let ready = input.failOpen;
      let release: (() => void) | null = null;
      dialog.showOpenDialog = () => {
        status.pickers++;
        return Promise.resolve({ canceled: false, filePaths: [input.directory] });
      };
      shell.openExternal = (url) => {
        status.links.push(url);
        return Promise.resolve();
      };
      ipcMain.on('vandashi:brand-recovery-ready', () => {
        ready = true;
      });
      ipcMain.on('vandashi:brand-recovery-release', () => {
        if (!release) throw new Error('No held brand request');
        const complete = release;
        release = null;
        status.pending = false;
        complete();
      });
      ipcMain.on('vandashi:brand-recovery-status', (_event, reply: (value: RecoveryStatus) => void) => {
        reply(status);
      });
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (event, method: unknown, args: unknown) => {
        if (method === 'models') return [];
        if (method === 'checks')
          return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
        if (method === 'openBrand') {
          status.opens++;
          if (input.failOpen && status.opens === 1)
            return { __vandashiFailure: 'v1', diagnostic: input.failure };
        }
        if (method !== 'createBrand') return invoke(event, method, args);
        const [request] = args as [{ parentPath: string; name: string }];
        status.creates.push(request);
        if (!ready) return { __vandashiFailure: 'v1', diagnostic: input.failure };
        if (input.failOpen) return invoke(event, method, args);
        status.pending = true;
        return new Promise<unknown>((resolve) => {
          release = () => {
            resolve(invoke(event, method, args));
          };
        });
      });
    },
    { directory, failure, failOpen },
  );
}

export function brandRecoveryStatus(desktop: ElectronApplication): Promise<RecoveryStatus> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<RecoveryStatus>((resolve) => {
        ipcMain.emit('vandashi:brand-recovery-status', undefined, resolve);
      }),
  );
}

export async function brandRecoveryControl(desktop: ElectronApplication, command: 'ready' | 'release') {
  await desktop.evaluate(({ ipcMain }, value) => {
    ipcMain.emit(`vandashi:brand-recovery-${value}`);
  }, command);
}
