import type { ElectronApplication } from '@playwright/test';
import type { AppEvent } from '../../src/domain/models';

export interface ChatControlAction {
  event?: AppEvent;
  persistEvent?: boolean;
  reload?: boolean;
  failSend?: boolean;
  discard?: 'success' | 'failure';
  open?: boolean;
}

export async function chatControl(desktopApp: ElectronApplication, action: ChatControlAction): Promise<void> {
  await desktopApp.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:test-control', undefined, value);
  }, action);
}
export function chatCalls(desktopApp: ElectronApplication): Promise<string[]> {
  return desktopApp.evaluate(
    ({ ipcMain }) =>
      new Promise<string[]>((resolve) => {
        ipcMain.emit('vandashi:test-calls', undefined, resolve);
      }),
  );
}

export function chatRequests(desktopApp: ElectronApplication): Promise<unknown[]> {
  return desktopApp.evaluate(
    ({ ipcMain }) =>
      new Promise<unknown[]>((resolve) => {
        ipcMain.emit('vandashi:test-requests', undefined, resolve);
      }),
  );
}
