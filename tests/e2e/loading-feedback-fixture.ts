import type { ElectronApplication, Locator } from '@playwright/test';
import type { IpcMainInvokeEvent } from 'electron';
import { expect } from './development-fixtures';

interface Request {
  id: number;
  method: string;
  args: unknown[];
}
interface Control {
  hold?: string[];
  finish?: { method?: string; id?: number; fail?: boolean };
}

/** Delay actual fixture handlers without changing their side effects or response values. */
export async function installFeedbackHolds(desktop: ElectronApplication, methods: string[] = []) {
  await desktop.evaluate(({ ipcMain }, initial) => {
    type Invoke = (event: IpcMainInvokeEvent, method: string, args: unknown[]) => unknown;
    const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Invoke> })._invokeHandlers.get(
      'vandashi:invoke',
    );
    if (!invoke) throw new Error('Missing fixture desktop handler');
    let hold = new Set(initial);
    let sequence = 0;
    const requests: Request[] = [];
    const pending = new Map<number, { request: Request; finish: (fail: boolean) => void }>();
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (event, method: string, args: unknown[]) => {
      if (!hold.has(method)) return invoke(event, method, args);
      const request = { id: ++sequence, method, args };
      requests.push(request);
      return new Promise((resolve, reject) => {
        pending.set(request.id, {
          request,
          finish: (fail) => {
            pending.delete(request.id);
            if (fail) {
              resolve({
                __vandashiFailure: 'v1',
                diagnostic: { kind: 'external', text: `Deferred ${method} failed.` },
              });
              return;
            }
            void Promise.resolve()
              .then(() => invoke(event, method, args))
              .then(resolve, reject);
          },
        });
      });
    });
    ipcMain.on('vandashi:feedback-control', (_event, action: Control) => {
      if (action.hold) hold = new Set(action.hold);
      const finish = action.finish;
      if (finish)
        for (const entry of [...pending.values()])
          if (
            (finish.id === undefined || entry.request.id === finish.id) &&
            (finish.method === undefined || entry.request.method === finish.method)
          )
            entry.finish(finish.fail ?? false);
    });
    ipcMain.on(
      'vandashi:feedback-observe',
      (_event, reply: (value: { requests: Request[]; pending: Request[] }) => void) => {
        reply({ requests, pending: [...pending.values()].map((entry) => entry.request) });
      },
    );
  }, methods);
}

export async function feedbackControl(desktop: ElectronApplication, action: Control) {
  await desktop.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:feedback-control', undefined, value);
  }, action);
}

export function feedbackState(
  desktop: ElectronApplication,
): Promise<{ requests: Request[]; pending: Request[] }> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise((resolve) => {
        ipcMain.emit('vandashi:feedback-observe', undefined, resolve);
      }),
  );
}

export async function expectPending(button: Locator) {
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button.locator('svg.spin')).toBeVisible();
  await expect(button.locator('svg.spin')).toHaveAttribute('aria-hidden', 'true');
}
