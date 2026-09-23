import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '../src/domain/models';
import { AgentError } from '../src/domain/agent';
import { mergeThreadHistory } from '../src/application/chat-history';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});
function message(id: string, turnId: string, role: ChatMessage['role'], text: string): ChatMessage {
  return { id, turnId, role, text, files: [], createdAt: '2026-01-01T00:00:00Z' };
}

describe('persisted Codex history recovery', () => {
  it('recovers missing finals and image outputs, preserves receipts/user IDs, and keeps undo boundaries correct', async () => {
    await app.api.sendChat(app.request);
    await app.idle();
    await app.api.sendChat({ ...app.request, text: 'A second request' });
    await app.idle();
    const before = await app.store.getSession(app.session.id);
    const users = before.messages.filter((entry) => entry.role === 'user');
    const receipts = before.messages.filter((entry) => entry.appMessage);
    const image: ChatMessage = {
      ...message('image', 'turn-1', 'tool', 'image_generation: completed'),
      generatedImages: [app.path + '/poster.png'],
    };
    app.agent.readThread.mockResolvedValue({
      id: 'thread',
      turnIds: ['turn-1', 'turn-2'],
      messages: [
        message('provider-user-1', 'turn-1', 'user', app.request.text),
        image,
        message('final-1', 'turn-1', 'assistant', 'Recovered first final'),
        message('provider-user-2', 'turn-2', 'user', 'A second request'),
        message('final-2', 'turn-2', 'assistant', 'Recovered second final'),
      ],
    });
    const recovered = await app.api.openChat({ scope: app.scope, topic: 'creation', title: 'Creation' });
    expect(recovered.messages.map((entry) => entry.id)).toEqual([
      users[0]?.id,
      'image',
      'final-1',
      receipts[0]?.id,
      users[1]?.id,
      'final-2',
      receipts[1]?.id,
    ]);
    expect(recovered.checkpoints?.[1]?.messageCount).toBe(4);
    expect(
      (await app.store.getSession(app.session.id)).messages.find((entry) => entry.id === 'image')
        ?.generatedImages,
    ).toEqual([app.path + '/poster.png']);
    expect(
      (await app.api.openChat({ scope: app.scope, topic: 'creation', title: 'Creation' })).messages,
    ).toEqual(recovered.messages);
    const undone = await app.api.undoChat(app.session.id);
    expect(undone.messages.map((entry) => entry.id)).toEqual([
      users[0]?.id,
      'image',
      'final-1',
      receipts[0]?.id,
    ]);
  });

  it('replaces partial snapshots while retaining local timestamps and informative provider content', () => {
    const partial = message('final', 'turn', 'assistant', 'Hel');
    const reasoning = message('reasoning', 'turn', 'reasoning', 'Useful visible summary');
    const local = { ...app.session, threadId: 'thread', messages: [partial, reasoning] };
    const merged = mergeThreadHistory(local, {
      id: 'thread',
      turnIds: ['turn'],
      messages: [
        { ...partial, text: 'Hello', createdAt: 'later' },
        { ...reasoning, text: '', createdAt: 'later' },
      ],
    });
    expect(merged.messages).toEqual([{ ...partial, text: 'Hello' }, reasoning]);
    expect(local.messages[0]?.text).toBe('Hel');
  });

  it('associates a lost-ACK submission without inventing a reversible checkpoint or duplicating it', () => {
    const pending = { ...message('local-user', 'unused', 'user', 'Preserve this'), turnId: null };
    const local = { ...app.session, threadId: 'thread', messages: [pending] };
    const merged = mergeThreadHistory(local, {
      id: 'thread',
      turnIds: ['recovered'],
      messages: [
        message('remote-user', 'recovered', 'user', pending.text),
        message('remote-final', 'recovered', 'assistant', 'Done before restart'),
      ],
    });
    expect(merged.messages.map((entry) => [entry.id, entry.turnId])).toEqual([
      ['local-user', 'recovered'],
      ['remote-final', 'recovered'],
    ]);
    expect(merged.checkpoints).toBeUndefined();
  });

  it('keeps older unavailable-thread context before a new thread and refuses mismatched identity', () => {
    const old = message('old', 'old-turn', 'assistant', 'Retained local history');
    const local = { ...app.session, threadId: 'new-thread', messages: [old] };
    const fresh = message('new', 'new-turn', 'assistant', 'New conversation');
    expect(
      mergeThreadHistory(local, { id: 'new-thread', turnIds: ['new-turn'], messages: [fresh] }).messages,
    ).toEqual([old, fresh]);
    expect(() => mergeThreadHistory(local, { id: 'different', turnIds: [], messages: [] })).toThrow(
      'different conversation',
    );
  });

  it('does not replace saved history on transient read errors and still handles genuinely missing threads', async () => {
    await app.api.sendChat(app.request);
    await app.idle();
    const saved = await app.store.getSession(app.session.id);
    app.agent.readThread.mockRejectedValueOnce(new AgentError('unavailable', 'Connection lost'));
    await expect(
      app.api.openChat({ scope: app.scope, topic: 'creation', title: 'Creation' }),
    ).rejects.toThrow('Connection lost');
    expect(await app.store.getSession(app.session.id)).toEqual(saved);
    app.agent.readThread.mockRejectedValueOnce(new AgentError('missing-history', 'Thread not found'));
    const reset = await app.api.openChat({ scope: app.scope, topic: 'creation', title: 'Creation' });
    expect(reset.threadId).toBeNull();
    expect(reset.messages).toEqual(saved.messages);
    expect(app.events.some((event) => event.type === 'notice' && event.code === 'missing-history')).toBe(
      true,
    );
    expect(
      app.events.find((event) => event.type === 'notice' && event.code === 'missing-history'),
    ).toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'appHistoryMissing' } },
    });
  });
});
