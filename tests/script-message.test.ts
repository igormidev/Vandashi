import { afterEach, beforeEach, expect, it } from 'vitest';
import { appMessagesEn } from '../src/domain/messages';
import { ReceiptToasts } from '../src/renderer/app/receipt-toasts';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

it.each(['', ' \n '])(
  'keeps empty-guidance handoff text typed through storage and provider hydration (%j)',
  async (guidance) => {
    const submitted = await app.api.saveScript({
      scope: app.scope,
      revision: app.workspace.revision,
      content: '# A changed script',
      guidance,
      selection: app.request.selection,
    });
    await app.idle();
    const stored = await app.store.getSession(submitted.id);
    const user = stored.messages.find((message) => message.role === 'user');
    expect(user).toMatchObject({
      text: appMessagesEn.scriptHandoff,
      appMessage: { id: 'scriptHandoff' },
      turnId: 'turn-1',
    });
    if (!user) throw new Error('Missing submitted message');
    app.agent.readThread.mockResolvedValue({
      id: 'thread',
      turnIds: ['turn-1'],
      messages: [
        {
          id: 'provider-user',
          role: 'user',
          turnId: 'turn-1',
          files: [],
          createdAt: user.createdAt,
          text: 'Provider-normalized text',
        },
      ],
    });
    const reopened = await app.api.openChat({ scope: app.scope, topic: 'creation', title: 'Creation' });
    expect(reopened.messages.filter((message) => message.role === 'user')).toEqual([user]);
    const submission = app.events.find(
      (event) => event.type === 'chat' && event.message.appMessage?.id === 'scriptHandoff',
    );
    if (!submission) throw new Error('Missing handoff event');
    expect(new ReceiptToasts().consume(submission)).toBeNull();
    expect((await app.git.status(app.path)).dirty).toBe(false);
  },
);

it.each([appMessagesEn.scriptHandoff, '\n  台本の表現を残して、音楽だけを追加してください。\n'])(
  'preserves actual guidance verbatim without inferring an app descriptor (%j)',
  async (guidance) => {
    const submitted = await app.api.saveScript({
      scope: app.scope,
      revision: app.workspace.revision,
      content: '# A changed script',
      guidance,
      selection: app.request.selection,
    });
    await app.idle();
    const user = (await app.store.getSession(submitted.id)).messages.find(
      (message) => message.role === 'user',
    );
    expect(user?.text).toBe(guidance);
    expect(user).not.toHaveProperty('appMessage');
    const run = app.agent.run.mock.calls.find(([input]) => !input.outputSchema);
    expect(run?.[0].prompt).toContain(guidance);
  },
);
