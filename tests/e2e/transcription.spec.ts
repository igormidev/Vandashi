import type { ElectronApplication } from '@playwright/test';
import type { IpcMainInvokeEvent } from 'electron';
import type { DesktopApi } from '../../src/domain/api';
import type { AppEvent, AppState } from '../../src/domain/models';
import type { TranscriptionProgress } from '../../src/domain/transcription';
import { installChatFixture } from './chat-fixture';
import { test, expect } from './development-fixtures';
import { proveDevelopment } from './startup-development-fixture';

interface Call {
  method: string;
  input: unknown;
}
interface Control {
  release?: 'startup' | 'model';
  fail?: boolean;
  progress?: TranscriptionProgress;
}

async function installFixture(desktop: ElectronApplication, mode: 'startup' | 'local' | 'model') {
  await installChatFixture(desktop, mode === 'local');
  await desktop.evaluate(({ ipcMain, BrowserWindow }, scenario) => {
    type Handler = (event: IpcMainInvokeEvent, method: unknown, args: unknown) => unknown;
    const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers.get(
      'vandashi:invoke',
    );
    if (!invoke) throw new Error('Missing fixture handler');
    const calls: Call[] = [];
    const pending = new Map<string, (fail: boolean) => void>();
    let reviewed = false;
    const emit = (event: AppEvent) =>
      BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', event);
    const hold = (owner: string, progress: TranscriptionProgress) => {
      emit({ type: 'activity', activity: { sessionId: owner, phase: 'working', detail: '' } });
      emit({ type: 'transcription', active: true, progress });
      return new Promise((resolve) => {
        pending.set(owner, (fail) => {
          pending.delete(owner);
          emit({ type: 'transcription', active: false, progress: { phase: 'checking' } });
          emit({ type: 'activity', activity: { sessionId: owner, phase: 'done', detail: '' } });
          resolve(
            fail
              ? {
                  __vandashiFailure: 'v1',
                  diagnostic: { kind: 'app', message: { id: 'appTranscriptionSetupFailed' } },
                }
              : { status: 'ready' },
          );
        });
      });
    };
    ipcMain.on('vandashi:transcription-test-control', (_event, action: Control) => {
      if (action.progress) emit({ type: 'transcription', active: true, progress: action.progress });
      if (action.release) pending.get(action.release)?.(action.fail ?? false);
    });
    ipcMain.on('vandashi:transcription-test-calls', (_event, reply: (value: Call[]) => void) => {
      reply(calls);
    });
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', async (event, method: string, args: unknown[]) => {
      const input = args[0];
      calls.push({ method, input });
      if (method === 'getState' && scenario === 'startup') {
        const state = (await invoke(event, method, args)) as AppState;
        return { ...state, settings: { ...state.settings, locale: 'pt-BR' } };
      }
      if (method === 'prepareTranscriptions') {
        const request = input as Parameters<DesktopApi['prepareTranscriptions']>[0];
        if (scenario === 'startup')
          return hold('startup', { phase: 'transcribing', file: 'interview.wav', completed: 0, total: 2 });
        if (scenario === 'local' && request.scope?.videoId) {
          if (request.categories?.length) {
            if (!reviewed) {
              reviewed = true;
              return {
                __vandashiFailure: 'v1',
                diagnostic: { kind: 'app', message: { id: 'appTranscriptionChoiceStale' } },
              };
            }
            if (request.categories[0]?.revision !== 'fresh-revision')
              throw new Error('Retry retained a stale reviewed revision');
            return { status: 'ready' };
          }
          return {
            status: 'needs-classification',
            assets: [
              {
                id: 'audio-one',
                title: 'Interview',
                relativePath: 'interview.wav',
                revision: reviewed ? 'fresh-revision' : 'old-revision',
              },
            ],
          };
        }
        return { status: 'ready' };
      }
      if (method === 'prepareTranscriptionModel') return hold('model', { phase: 'installing' });
      return invoke(event, method, args);
    });
  }, mode);
}

function calls(desktop: ElectronApplication): Promise<Call[]> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise<Call[]>((resolve) => {
        ipcMain.emit('vandashi:transcription-test-calls', undefined, resolve);
      }),
  );
}

async function control(desktop: ElectronApplication, action: Control) {
  await desktop.evaluate(({ ipcMain }, value) => {
    ipcMain.emit('vandashi:transcription-test-control', undefined, value);
  }, action);
}

test('startup preparation survives StrictMode replay and offers localized recovery without reopening a missing brand', async ({
  desktopApp,
  page,
}) => {
  await expect(page.locator('.home')).toBeVisible();
  await installFixture(desktopApp, 'startup');
  await page.reload();
  await proveDevelopment(page);
  const status = page.locator('.transcription-status');
  await expect(status).toContainText('Transcrevendo falas…');
  await expect(status).toContainText('interview.wav');
  await expect(status).toContainText('0 / 2 arquivos');
  await expect(status).toHaveAttribute('aria-busy', 'true');
  await expect(status.locator('.spin')).toBeVisible();
  await expect(status.getByRole('progressbar')).toHaveCount(0);
  expect((await calls(desktopApp)).filter((entry) => entry.method === 'prepareTranscriptions')).toHaveLength(
    1,
  );
  await control(desktopApp, { release: 'startup', fail: true });
  await expect(page.getByRole('alert')).toContainText('A configuração da transcrição falhou.');
  await expect(page.getByRole('alert')).not.toContainText('VANDASHI_DIAGNOSTIC');
  await page.getByRole('button', { name: 'Marcas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Suas marcas', exact: true })).toBeVisible();
  expect((await calls(desktopApp)).filter((entry) => entry.method === 'openBrand')).toHaveLength(0);
});

test('local category review retries discovery and submits the newly reviewed media revision', async ({
  desktopApp,
  page,
}) => {
  await expect(page.locator('.home')).toBeVisible();
  await installFixture(desktopApp, 'local');
  await page.reload();
  await proveDevelopment(page);
  const dialog = page.getByRole('dialog', { name: 'Audio type', exact: true });
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'interview.wav', exact: true }).selectOption('dialog');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'The audio changed after review. Choose its type again.',
  );
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'interview.wav', exact: true })).toHaveValue('');
  await dialog.getByRole('combobox', { name: 'interview.wav', exact: true }).selectOption('music');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toBeVisible();
  const preparations = (await calls(desktopApp)).filter((entry) => entry.method === 'prepareTranscriptions');
  expect(preparations).toHaveLength(5);
  expect(preparations.at(-2)?.input).toMatchObject({ categories: [] });
  expect(preparations.at(-1)?.input).toMatchObject({
    categories: [{ assetId: 'audio-one', revision: 'fresh-revision', category: 'music' }],
  });
});

test('Settings keeps model selection, save and dismissal locked through download settlement', async ({
  desktopApp,
  page,
}) => {
  await expect(page.locator('.home')).toBeVisible();
  await installFixture(desktopApp, 'model');
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  const model = dialog.getByRole('combobox', { name: 'Transcription model', exact: true });
  await model.selectOption('small');
  await expect(dialog.locator('.transcription-status')).toContainText('Installing transcription tools…');
  await expect(model).toBeDisabled();
  await expect(model).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await control(desktopApp, { progress: { phase: 'model-download', fraction: 0.4 } });
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', '0.4');
  await control(desktopApp, { release: 'model' });
  await expect(model).toBeEnabled();
  await expect(model).toHaveValue('small');
  await expect(dialog.locator('.transcription-status')).toHaveCount(0);
  expect((await calls(desktopApp)).filter((entry) => entry.method === 'prepareTranscriptionModel')).toEqual([
    { method: 'prepareTranscriptionModel', input: 'small' },
  ]);
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await calls(desktopApp)).find((entry) => entry.method === 'settings')?.input).toMatchObject({
    transcriptionModel: 'small',
  });
});
