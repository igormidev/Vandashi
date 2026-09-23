import type { ElectronApplication } from '@playwright/test';
import type { IpcMainInvokeEvent } from 'electron';

export async function installPicker(desktop: ElectronApplication, selections: string[][]) {
  await desktop.evaluate(({ ipcMain }, choices) => {
    type Invoke = (event: IpcMainInvokeEvent, method: string, args: unknown[]) => unknown;
    const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Invoke> })._invokeHandlers.get(
      'vandashi:invoke',
    );
    if (!invoke) throw new Error('Missing chat handler');
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (event, method: string, args: unknown[]) => {
      if (method === 'chooseFiles') return choices.shift() ?? [];
      return invoke(event, method, args);
    });
  }, selections);
}
