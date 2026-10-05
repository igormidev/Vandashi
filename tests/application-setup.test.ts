import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AgentError } from '../src/domain/agent';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

async function installation(topic = 'setup:media-ffmpeg') {
  return app.api.openChat({ scope: app.scope, topic, title: 'Install FFmpeg' });
}

it('installs from a separate host workspace without project hydration, commits or Undo receipts', async () => {
  const session = await installation();
  const hydrate = vi.spyOn(app.store, 'openWorkspace');
  const discover = vi.spyOn(app.store, 'discoverAgentScope');
  const before = await app.git.head(app.path);
  app.events.length = 0;
  await app.api.sendChat({ ...app.request, sessionId: session.id, text: 'Install FFmpeg, please.' });
  await app.idle();
  expect(app.agent.run).toHaveBeenCalledTimes(1);
  expect(app.agent.refreshConfiguration).toHaveBeenCalledOnce();
  const input = app.agent.run.mock.calls[0]?.[0];
  expect(input).toMatchObject({ purpose: 'host-setup', mode: 'edit', writableRoots: [], attachments: [] });
  expect(input?.cwd).toBe(await app.store.setupWorkspace());
  expect(input?.cwd).not.toBe(app.path);
  expect(input?.prompt).toContain('https://ffmpeg.org/download.html');
  expect(input?.prompt).toContain('Install FFmpeg, please.');
  expect(hydrate).not.toHaveBeenCalled();
  expect(discover).not.toHaveBeenCalled();
  expect(await app.git.head(app.path)).toBe(before);
  const saved = await app.store.getSession(session.id);
  expect(saved.messages.find((message) => message.role === 'user')?.text).toBe('Install FFmpeg, please.');
  expect(saved.messages.some((message) => message.appMessage?.id === 'turnSaved')).toBe(false);
  expect(saved.checkpoints).toEqual([]);
  await expect(app.api.undoChat(session.id)).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'appSetupUndoUnavailable' } },
  });
  expect(app.agent.forkBefore).not.toHaveBeenCalled();
});

it.each(['completed', 'interrupted', 'failed'] as const)(
  'announces one recheck only after a %s turn persists and releases the operation',
  async (status) => {
    const session = await installation();
    let finish: (() => void) | undefined;
    app.agent.run.mockImplementationOnce((_input, event) => {
      event({ type: 'thread', threadId: 'installation' });
      event({ type: 'turn', turnId: 'install-turn' });
      return new Promise((resolve) => {
        finish = () => {
          resolve({ threadId: 'installation', turnId: 'install-turn', status, output: '', error: null });
        };
      });
    });
    await app.api.sendChat({ ...app.request, sessionId: session.id });
    expect(app.events.some((event) => event.type === 'chat-settled')).toBe(false);
    await expect(app.api.checks({ scope: app.scope, video: true })).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'appOperationBusy' } },
    });
    finish?.();
    await vi.waitFor(() => {
      expect(app.events.filter((event) => event.type === 'chat-settled')).toHaveLength(1);
    });
    const settled = app.events.findIndex((event) => event.type === 'chat-settled');
    const idle =
      app.events
        .map((event, index) => (event.type === 'activity' && event.activity.phase === 'done' ? index : -1))
        .filter((index) => index >= 0)
        .at(-1) ?? -1;
    expect(settled).toBeGreaterThan(idle);
    expect((await app.store.getSession(session.id)).threadId).toBe('installation');
    await expect(app.api.checks({ scope: app.scope, video: false })).resolves.toBeDefined();
  },
);

it('preserves uncertain installation history and releases only after provider shutdown settles', async () => {
  const session = await installation();
  let stopped: (() => void) | undefined;
  app.agent.run.mockImplementationOnce((_input, event) => {
    event({ type: 'thread', threadId: 'uncertain-installation' });
    return new Promise((_resolve, reject) => {
      stopped = () => {
        reject(new AgentError('uncertain-start', { id: 'codexUncertainStart' }));
      };
    });
  });
  const send = app.api.sendChat({ ...app.request, sessionId: session.id }).catch((error: unknown) => error);
  await vi.waitFor(() => {
    expect(stopped).toBeDefined();
  });
  expect(app.events.some((event) => event.type === 'chat-settled')).toBe(false);
  stopped?.();
  expect(await send).toMatchObject({ code: 'uncertain-start' });
  await vi.waitFor(() => {
    expect(app.events.filter((event) => event.type === 'chat-settled')).toHaveLength(1);
  });
  expect((await app.store.getSession(session.id)).messages.map((message) => message.role)).toEqual([
    'user',
    'error',
  ]);
});

it('revalidates current Codex permission before setup, even after a successful prerequisite check', async () => {
  const session = await installation();
  app.agent.connect.mockResolvedValueOnce({
    connected: true,
    authenticated: true,
    accountType: 'chatgpt',
    usageAllowed: null,
    version: 'test',
  });
  await expect(app.api.sendChat({ ...app.request, sessionId: session.id })).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'appUsageUnverified' } },
  });
  expect(app.agent.run).not.toHaveBeenCalled();
  expect((await app.store.getSession(session.id)).messages).toEqual([]);
});

it('does not derive host access from arbitrary repair topics or from a setup prefix alone', async () => {
  const session = await installation('setup:arbitrary-shell');
  await expect(app.api.sendChat({ ...app.request, sessionId: session.id })).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'untrustedRequest' } },
  });
  expect(app.agent.run).not.toHaveBeenCalled();
  await app.api.sendChat({ ...app.request, text: 'Install FFmpeg on my computer.' });
  await app.idle();
  expect(app.agent.run.mock.calls[0]?.[0].purpose).toBeUndefined();
});

it('holds the setup lease through configuration shutdown before announcing the automatic recheck', async () => {
  const session = await installation('setup:skill');
  let stopped: (() => void) | undefined;
  app.agent.refreshConfiguration.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        stopped = resolve;
      }),
  );
  await app.api.sendChat({ ...app.request, sessionId: session.id });
  await vi.waitFor(() => {
    expect(stopped).toBeDefined();
  });
  expect(app.events.some((event) => event.type === 'chat-settled')).toBe(false);
  await expect(app.api.checks({ scope: app.scope, video: true })).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'appOperationBusy' } },
  });
  stopped?.();
  await vi.waitFor(() => {
    expect(app.events.filter((event) => event.type === 'chat-settled')).toHaveLength(1);
  });
});
