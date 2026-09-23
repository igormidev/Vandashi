import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppFault } from '../src/domain/diagnostics';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

describe('application diagnostic persistence', () => {
  it.each([
    {
      name: 'app',
      error: new AppFault({ id: 'appMessageEmpty' }),
      diagnostic: { kind: 'app', message: { id: 'appMessageEmpty' } },
    },
    {
      name: 'external',
      error: new Error('Enter a message first.'),
      diagnostic: { kind: 'external', text: 'Enter a message first.' },
    },
  ])(
    'preserves $name provenance after a completed startup and a storage reload',
    async ({ error, diagnostic }) => {
      app.agent.run.mockImplementationOnce((_input, event) => {
        event({ type: 'thread', threadId: 'thread' });
        event({ type: 'turn', turnId: 'failed-turn' });
        return Promise.reject(error);
      });
      await app.api.sendChat({ ...app.request, mode: 'read' });
      await app.idle();
      const store = new LocalStorage(join(app.root, 'settings'), app.git);
      const saved = await store.getSession(app.session.id);
      expect(saved.messages.find((message) => message.role === 'error')).toMatchObject({
        text: error.message,
        diagnostic,
      });
      expect(saved.messages.some((message) => message.appMessage?.id === 'turnSaved')).toBe(false);
    },
  );

  it('retains a failed turn’s provider text under a translatable wrapper and forwards app warnings', async () => {
    const warning = new AppFault({ id: 'codexRequestWithheld', params: { method: 'requestApproval' } });
    const raw = '服务 unavailable\nDo not translate provider detail.';
    app.agent.run.mockImplementationOnce((_input, event) => {
      event({ type: 'thread', threadId: 'thread' });
      event({ type: 'turn', turnId: 'failed-turn' });
      event({ type: 'warning', detail: warning.message, diagnostic: warning.diagnostic });
      return Promise.resolve({
        threadId: 'thread',
        turnId: 'failed-turn',
        status: 'failed',
        error: raw,
        output: '',
      });
    });
    await app.api.sendChat({ ...app.request, mode: 'read' });
    await app.idle();
    const saved = await app.store.getSession(app.session.id);
    expect(saved.messages.find((message) => message.role === 'error')).toMatchObject({
      text: 'The AI operation failed. Your work will be preserved.\n' + raw,
      diagnostic: { kind: 'app', message: { id: 'appOperationFailed' }, externalDetail: raw },
    });
    expect(
      app.events.find((event) => event.type === 'notice' && event.code === 'agent-warning'),
    ).toMatchObject({
      detail: warning.message,
      diagnostic: warning.diagnostic,
    });
  });

  it('returns a stable URL validation diagnostic before updating the launch record', async () => {
    await expect(
      app.api.updateLaunch({
        scope: app.scope,
        launch: { platform: 'youtube', clipId: null, status: 'uploaded', url: 'not a URL' },
      }),
    ).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'appPublishedUrlInvalid' } },
    });
    expect((await app.store.openWorkspace(app.scope)).launches).toEqual(app.workspace.launches);
  });
});
