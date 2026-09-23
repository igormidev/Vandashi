import type { ElectronApplication } from '@playwright/test';
import type { ChatSession, DependencyCheck } from '../../src/domain/models';
import type { DesktopApi } from '../../src/domain/api';
import { chatFixtureData } from './chat-fixture-data';
import { test, expect } from './development-fixtures';
import { proveDevelopment } from './startup-development-fixture';
import { requiredDoctorChecks } from '../../src/infrastructure/media/diagnostics';
import type { Locale } from '../../src/domain/locales';
import { appMessageCatalogs } from '../../src/domain/messages/catalogs';

type CodexState = 'unavailable' | 'signed-out' | 'quota' | 'unverified' | 'omitted' | 'ready';
interface Control {
  codex: CodexState;
  mediaReady: boolean;
  skillMissing?: boolean;
}
async function install(
  desktop: ElectronApplication,
  initial: Control,
  failure?: DependencyCheck,
  locale: Locale = 'en',
) {
  const missingMedia =
    failure ?? requiredDoctorChecks('{"checks":[]}').find((check) => check.id === 'media-ffmpeg');
  if (!missingMedia) throw new Error('Missing dependency fixture');
  const data = chatFixtureData(true, {});
  data.state.settings.locale = locale;
  await desktop.evaluate(
    ({ ipcMain }, fixture) => {
      let control = fixture.initial;
      const sessions: ChatSession[] = [];
      const calls: { method: string; input: unknown }[] = [];
      ipcMain.on('vandashi:dependency-control', (_event, value: Control) => {
        control = value;
      });
      ipcMain.on('vandashi:dependency-calls', (_event, reply: (value: typeof calls) => void) => {
        reply(calls);
      });
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
        const input = args[0];
        calls.push({ method, input });
        if (method === 'getState') return fixture.data.state;
        if (method === 'models') return fixture.data.models;
        if (method === 'openBrand' || method === 'openWorkspace') return fixture.data.workspace;
        if (method === 'checks') {
          const checks: DependencyCheck[] = [];
          if (control.codex !== 'omitted')
            checks.push({
              id: 'Codex',
              status: control.codex === 'ready' ? 'ready' : 'missing',
              detail: `Codex ${control.codex}`,
              ...(control.codex === 'unverified'
                ? { diagnostic: { kind: 'app' as const, message: { id: 'appUsageUnverified' as const } } }
                : {}),
              repairPrompt: null,
              helpUrl: 'https://developers.openai.com/codex/cli/',
            });
          checks.push(
            control.mediaReady
              ? {
                  id: fixture.missingMedia.id,
                  status: 'ready',
                  detail: '',
                  repairPrompt: null,
                  helpUrl: null,
                }
              : fixture.missingMedia,
          );
          checks.push({
            id: 'skill',
            status: control.skillMissing ? 'missing' : 'ready',
            detail: 'Core skill setup',
            repairPrompt: null,
            helpUrl: 'https://hyperframes.heygen.com/guides/skills',
          });
          return checks;
        }
        if (method === 'sessions') return sessions;
        if (method === 'openChat') {
          const request = input as Parameters<DesktopApi['openChat']>[0];
          let session = sessions.find((entry) => entry.topic === request.topic);
          if (!session) {
            session = {
              id: request.topic,
              topic: request.topic,
              title: request.title,
              scope: request.scope,
              threadId: null,
              messages: [],
              open: true,
              updatedAt: '',
            };
            sessions.push(session);
          }
          return session;
        }
        if (method === 'openExternal') return;
        throw new Error(`Unexpected dependency fixture method: ${method}`);
      });
    },
    { data, initial, missingMedia },
  );
}
async function update(desktop: ElectronApplication, value: Control) {
  await desktop.evaluate(({ ipcMain }, control) => {
    ipcMain.emit('vandashi:dependency-control', undefined, control);
  }, value);
}
function requests(desktop: ElectronApplication): Promise<{ method: string; input: unknown }[]> {
  return desktop.evaluate(
    ({ ipcMain }) =>
      new Promise((resolve) => {
        ipcMain.emit('vandashi:dependency-calls', undefined, resolve);
      }),
  );
}

for (const codex of ['unavailable', 'signed-out', 'quota', 'omitted'] as const) {
  test(`external dependency setup keeps Codex availability (${codex}) verified on every retry`, async ({
    desktopApp,
    page,
  }) => {
    await install(desktopApp, { codex, mediaReady: false });
    await page.reload();
    await proveDevelopment(page);
    await expect(page.getByRole('button', { name: 'Check again', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resolve with AI', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'AI chat', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Installation guide', exact: true }).first().click();
    expect((await requests(desktopApp)).filter((call) => call.method === 'openExternal').at(-1)?.input).toBe(
      codex === 'omitted' ? 'https://ffmpeg.org/download.html' : 'https://developers.openai.com/codex/cli/',
    );
    await update(desktopApp, { codex: 'ready', mediaReady: false });
    await page.getByRole('button', { name: 'Check again', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resolve with AI', exact: true })).toHaveCount(0);
    await expect(
      page.getByText(/FFmpeg is unavailable\. Install or repair it outside Vandashi/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Installation guide', exact: true }).click();
    expect((await requests(desktopApp)).filter((call) => call.method === 'openExternal').at(-1)?.input).toBe(
      'https://ffmpeg.org/download.html',
    );
    await update(desktopApp, { codex: 'quota', mediaReady: false });
    await page.getByRole('button', { name: 'Check again', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Resolve with AI', exact: true })).toHaveCount(0);
    await update(desktopApp, { codex: 'unverified', mediaReady: false });
    await page.getByRole('button', { name: 'Check again', exact: true }).click();
    await expect(
      page.getByText('Could not verify your available Codex usage. Check your connection and try again.'),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Resolve with AI', exact: true })).toHaveCount(0);
    await update(desktopApp, { codex: 'ready', mediaReady: true });
    await page.getByRole('button', { name: 'Check again', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Preparing your workspace', exact: true })).toHaveCount(0);
    expect((await requests(desktopApp)).some((call) => call.method === 'sendChat')).toBe(false);
  });
}

for (const failure of [
  {
    id: 'Git',
    message: 'appWorkspaceRecoveryRequired',
    cause: { id: 'gitDirectoryNotLocal' },
    causeText: 'The project Git directory must be local to this workspace.',
    helpUrl: 'https://git-scm.com/downloads',
    text: /Workspace recovery failed/,
  },
  {
    id: 'hyperframes',
    message: 'mediaBundledRuntimeRecovery',
    cause: { id: 'mediaCommandExited', params: { code: '7' } },
    causeText: 'The media command exited with code 7.',
    helpUrl: 'https://github.com/igormidev/Vandashi#run-from-source',
    text: /Vandashi's bundled video runtime could not be verified/,
  },
] as const) {
  test(`${failure.id} failure offers external recovery and requires a successful retry`, async ({
    desktopApp,
    page,
  }) => {
    await install(
      desktopApp,
      { codex: 'ready', mediaReady: false },
      {
        id: failure.id,
        status: 'error',
        detail: '',
        diagnostic: {
          kind: 'app',
          message: failure.cause,
          ...(failure.id === 'hyperframes' ? { externalDetail: 'Native dependency fixture Ω' } : {}),
        },
        recovery: { id: failure.message },
        repairPrompt: null,
        helpUrl: failure.helpUrl,
      },
    );
    await page.reload();
    await proveDevelopment(page);
    await expect(page.getByText(failure.text)).toBeVisible();
    await expect(page.getByText(failure.causeText, { exact: false })).toBeVisible();
    if (failure.id === 'hyperframes')
      await expect(page.getByText(/Native dependency fixture Ω/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resolve with AI', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Installation guide', exact: true }).click();
    expect((await requests(desktopApp)).find((call) => call.method === 'openExternal')?.input).toBe(
      failure.helpUrl,
    );
    await page.getByRole('button', { name: 'Check again', exact: true }).click();
    await expect(page.getByText(failure.text)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveCount(0);
    await update(desktopApp, { codex: 'ready', mediaReady: true });
    await page.getByRole('button', { name: 'Check again', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toBeVisible();
    expect((await requests(desktopApp)).some((call) => call.method === 'sendChat')).toBe(false);
  });
}

test('missing core skill opens official external setup and enters the workspace only after verification succeeds', async ({
  desktopApp,
  page,
}) => {
  await install(desktopApp, { codex: 'ready', mediaReady: true, skillMissing: true });
  await page.reload();
  await proveDevelopment(page);
  await expect(page.getByRole('button', { name: 'Resolve with AI', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Installation guide', exact: true }).click();
  expect((await requests(desktopApp)).find((call) => call.method === 'openExternal')?.input).toBe(
    'https://hyperframes.heygen.com/guides/skills',
  );
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveCount(0);
  await update(desktopApp, { codex: 'ready', mediaReady: true });
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toBeVisible();
  expect((await requests(desktopApp)).some((call) => call.method === 'sendChat')).toBe(false);
});

test('renders the original typed cause and separate recovery in the saved language while preserving raw detail', async ({
  desktopApp,
  page,
}) => {
  await install(
    desktopApp,
    { codex: 'ready', mediaReady: false },
    {
      id: 'hyperframes',
      status: 'error',
      detail: 'English legacy fallback must not replace the typed cause.',
      diagnostic: {
        kind: 'app',
        message: { id: 'mediaCommandExited', params: { code: '7' } },
        externalDetail: 'Original process output Ω',
      },
      recovery: { id: 'mediaBundledRuntimeRecovery' },
      repairPrompt: null,
      helpUrl: 'https://github.com/igormidev/Vandashi#run-from-source',
    },
    'pt-BR',
  );
  await page.reload();
  await proveDevelopment(page);
  const catalog = appMessageCatalogs['pt-BR'];
  await expect(
    page.getByText(catalog.mediaCommandExited.replace('{{code}}', '7'), { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(catalog.mediaBundledRuntimeRecovery, { exact: true })).toBeVisible();
  await expect(page.getByText(/Original process output Ω/)).toBeVisible();
  await expect(page.getByText(/English legacy fallback/)).toHaveCount(0);
});
