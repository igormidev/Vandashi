import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBackend } from '../src/application/backend';
import type { AgentPort } from '../src/domain/agent';
import type { ChatMessage } from '../src/domain/models';
import { applicationFixture } from './application-fixture';

async function historyFixture() {
  const fixture = await applicationFixture();
  const child = await fixture.store.createClip({
    scope: fixture.scope,
    name: 'History child',
    ratio: '9:16',
    start: 0,
    end: 20,
  });
  const repositories = (await fixture.store.discoverAgentScope(fixture.scope)).repositories;
  expect(repositories).toContain(child.path);
  for (const repository of repositories) {
    await writeFile(join(repository, 'history.md'), 'Original content');
    await fixture.git.commit(repository, 'Prepare history', 'Preserve a real multi-repository baseline.');
  }
  const forkThrough = vi.fn<NonNullable<AgentPort['forkThrough']>>();
  const agent = { ...fixture.agent, forkThrough };
  const api = createBackend(fixture.store, fixture.git, agent, fixture.media, fixture.host, (event) => {
    fixture.events.push(event);
  });
  let turn = 0;
  agent.run.mockImplementation(async (input, emit) => {
    if (input.outputSchema)
      return {
        threadId: 'helper',
        turnId: 'helper',
        status: 'completed',
        error: null,
        output: '{"title":"Save history","body":"Preserve all registered repository edits."}',
      };
    turn++;
    const turnId = `history-${String(turn)}`;
    emit({ type: 'thread', threadId: 'original-history' });
    emit({ type: 'turn', turnId });
    for (const repository of repositories)
      await writeFile(join(repository, 'history.md'), `Content after ${turnId}`);
    emit({
      type: 'message',
      delta: false,
      message: {
        id: `answer-${String(turn)}`,
        role: 'assistant',
        turnId,
        text: `Answer ${String(turn)}`,
        files: [],
        createdAt: `2026-10-07T10:00:0${String(turn)}Z`,
      },
    });
    return { threadId: 'original-history', turnId, status: 'completed', error: null, output: '' };
  });
  for (let index = 1; index <= 3; index++) {
    await api.sendChat({ ...fixture.request, text: `Raw request ${String(index)}\nKeep this exact.` });
    await fixture.idle();
  }
  const session = await fixture.store.getSession(fixture.session.id);
  const users = session.messages.filter((message) => message.role === 'user');
  expect(users).toHaveLength(3);
  expect(session.checkpoints).toHaveLength(3);
  return { ...fixture, api, agent, repositories, session, users };
}
type HistoryFixture = Awaited<ReturnType<typeof historyFixture>>;
let app: HistoryFixture;
beforeEach(async () => {
  app = await historyFixture();
});
afterEach(async () => {
  await app.cleanup();
});

function user(index: number): ChatMessage {
  const message = app.users[index];
  if (!message) throw new Error('Missing historical user');
  return message;
}
function target(index: number) {
  return { sessionId: app.session.id, messageId: user(index).id };
}
async function contents() {
  return Promise.all(app.repositories.map((repository) => readFile(join(repository, 'history.md'), 'utf8')));
}
async function heads() {
  return Object.fromEntries(
    await Promise.all(
      app.repositories.map(async (repository) => [repository, await app.git.head(repository)] as const),
    ),
  );
}
function appFailure(id: string) {
  return { diagnostic: { kind: 'app', message: { id } } };
}

it.each([0, 1])(
  'rewinds historical request %i and every registered repository before its exact provider turn',
  async (index) => {
    const checkpoint = app.session.checkpoints?.[index];
    if (!checkpoint) throw new Error('Missing historical checkpoint');
    const originalHeads = await heads();
    const result = await app.api.rewindChat(target(index));
    expect(app.agent.forkBefore).toHaveBeenCalledExactlyOnceWith('original-history', checkpoint.turnId);
    expect(result.draft).toEqual({
      text: user(index).text,
      mode: 'edit',
      collaboration: 'default',
      attachments: [],
    });
    expect(result.session.threadId).toBe(`fork-${checkpoint.turnId}`);
    expect(result.session.messages).toEqual(app.session.messages.slice(0, checkpoint.messageCount));
    expect(result.session.checkpoints).toHaveLength(index);
    expect(await contents()).toEqual(
      app.repositories.map(() => (index === 0 ? 'Original content' : 'Content after history-1')),
    );
    for (const repository of app.repositories) {
      expect((await app.git.status(repository)).dirty).toBe(false);
      expect(await app.git.head(repository)).not.toBe(originalHeads[repository]);
      expect(await app.git.readAt(repository, originalHeads[repository] ?? '', 'history.md')).toBe(
        'Content after history-3',
      );
    }
    expect(await app.store.getSession(app.session.id)).toEqual(result.session);
    if (index === 1) {
      expect(result.session.checkpoints?.[0]?.postHeads).toEqual(await heads());
      await app.api.rewindChat(target(0));
      expect(app.agent.forkBefore).toHaveBeenLastCalledWith('original-history', 'history-1');
      expect(await contents()).toEqual(app.repositories.map(() => 'Original content'));
    }
  },
);

it.each(['dirty', 'commit'] as const)(
  'preserves external %s work arriving during a historical provider fork',
  async (kind) => {
    const repository = app.repositories.at(-1);
    if (!repository) throw new Error('Missing repository');
    const original = await app.store.getSession(app.session.id);
    let externalHead = await app.git.head(repository);
    app.agent.forkBefore.mockImplementationOnce(async () => {
      await writeFile(join(repository, 'history.md'), 'External work during historical fork');
      if (kind === 'commit')
        externalHead = await app.git.commit(repository, 'External work', 'Keep concurrent edits.');
      return { id: 'unused-fork', turnIds: [], messages: [] };
    });
    const restore = vi.spyOn(app.git, 'restore');
    await expect(app.api.rewindChat(target(1))).rejects.toMatchObject(
      appFailure(kind === 'dirty' ? 'appSaveBeforeUndo' : 'appUndoLaterChanges'),
    );
    expect(restore).not.toHaveBeenCalled();
    expect(await app.git.head(repository)).toBe(externalHead);
    expect(await readFile(join(repository, 'history.md'), 'utf8')).toBe(
      'External work during historical fork',
    );
    expect(await app.store.getSession(app.session.id)).toEqual(original);
  },
);

it('compensates earlier historical restores while preserving an external commit in a later repository', async () => {
  const first = Object.keys(app.session.checkpoints?.[1]?.heads ?? {})[0];
  const later = app.repositories.find((repository) => repository !== first);
  if (!first || !later) throw new Error('Missing restoration boundaries');
  const restore = app.git.restore.bind(app.git);
  let externalHead = '';
  let injected = false;
  vi.spyOn(app.git, 'restore').mockImplementation(async (repository, revision, expected) => {
    const owned = await restore(repository, revision, expected);
    if (repository === first && !injected) {
      injected = true;
      await writeFile(join(later, 'history.md'), 'External work between historical restores');
      externalHead = await app.git.commit(later, 'Concurrent update', 'Preserve the external repository.');
    }
    return owned;
  });
  await expect(app.api.rewindChat(target(1))).rejects.toMatchObject(appFailure('appUndoFailed'));
  expect(await app.git.head(later)).toBe(externalHead);
  expect(await readFile(join(later, 'history.md'), 'utf8')).toBe('External work between historical restores');
  expect(await readFile(join(first, 'history.md'), 'utf8')).toBe('Content after history-3');
  const recovered = await app.store.getSession(app.session.id);
  expect(recovered.messages).toEqual(app.session.messages);
  expect(recovered.threadId).toBe(app.session.threadId);
  expect(recovered.checkpoints?.at(-1)?.postHeads?.[first]).toBe(await app.git.head(first));
  expect(recovered.checkpoints?.at(-1)?.postHeads?.[later]).toBe(
    app.session.checkpoints?.at(-1)?.postHeads?.[later],
  );
  await expect(app.api.rewindChat(target(1))).rejects.toMatchObject(appFailure('appUndoLaterChanges'));
});

it('restores all original contents and durable ownership after a failed historical save, then permits retry', async () => {
  const originalHeads = await heads();
  vi.spyOn(app.store, 'saveSession').mockRejectedValueOnce(new Error('Injected historical write failure'));
  await expect(app.api.rewindChat(target(1))).rejects.toMatchObject(appFailure('appUndoFailed'));
  expect(await contents()).toEqual(app.repositories.map(() => 'Content after history-3'));
  const recovered = await app.store.getSession(app.session.id);
  expect(recovered.messages).toEqual(app.session.messages);
  expect(recovered.threadId).toBe(app.session.threadId);
  expect(recovered.checkpoints).toHaveLength(3);
  expect(recovered.checkpoints?.at(-1)?.postHeads).toEqual(await heads());
  for (const repository of app.repositories) {
    expect((await app.git.status(repository)).dirty).toBe(false);
    expect(await app.git.readAt(repository, originalHeads[repository] ?? '', 'history.md')).toBe(
      'Content after history-3',
    );
  }
  await app.api.rewindChat(target(1));
  expect(await contents()).toEqual(app.repositories.map(() => 'Content after history-1'));
});

it.each(['publish:youtube', 'setup:media-ffmpeg'])(
  'rejects historical restoration across %s effects before provider or Git mutation',
  async (topic) => {
    const changed = structuredClone(app.session);
    changed.topic = topic;
    for (const checkpoint of changed.checkpoints ?? [])
      checkpoint.mode = checkpoint.turnId === 'history-2' ? 'edit' : 'read';
    await app.store.saveSession(changed);
    const originalHeads = await heads();
    const restore = vi.spyOn(app.git, 'restore');
    await expect(app.api.rewindChat(target(0))).rejects.toMatchObject(
      appFailure(topic.startsWith('setup:') ? 'appSetupUndoUnavailable' : 'appPublishUndoUnavailable'),
    );
    expect(app.agent.forkBefore).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(await heads()).toEqual(originalHeads);
    expect(await app.store.getSession(app.session.id)).toEqual(changed);
  },
);

it('blocks historical actions through an active turn and a held queue until the queued request is removed', async () => {
  let finish: (() => void) | undefined;
  app.agent.run.mockImplementationOnce((_input, emit) => {
    emit({ type: 'thread', threadId: 'original-history' });
    emit({ type: 'turn', turnId: 'history-4' });
    return new Promise((resolve) => {
      finish = () => {
        resolve({
          threadId: 'original-history',
          turnId: 'history-4',
          status: 'interrupted',
          error: null,
          output: '',
        });
      };
    });
  });
  await app.api.sendChat(app.request);
  const queued = { ...app.request, text: 'Held exact request', clientMessageId: crypto.randomUUID() };
  try {
    await app.api.queueChat(queued);
    await expect(app.api.rewindChat(target(0))).rejects.toMatchObject(appFailure('appOperationBusy'));
    await expect(
      app.api.forkChat({ sessionId: app.session.id, messageId: 'answer-2' }),
    ).rejects.toMatchObject(appFailure('appOperationBusy'));
    await app.api.cancelChat();
  } finally {
    finish?.();
  }
  await app.idle();
  const original = await app.store.getSession(app.session.id);
  const originalHeads = await heads();
  expect((await app.api.queuedChats(app.session.id))[0]?.failed).toBe(true);
  for (const action of [
    () => app.api.rewindChat(target(0)),
    () => app.api.forkChat({ sessionId: app.session.id, messageId: 'answer-2' }),
  ])
    await expect(action()).rejects.toMatchObject(appFailure('appOperationBusy'));
  expect(app.agent.forkBefore).not.toHaveBeenCalled();
  expect(app.agent.forkThrough).not.toHaveBeenCalled();
  expect(await app.store.getSession(app.session.id)).toEqual(original);
  expect(await heads()).toEqual(originalHeads);
  await app.api.removeQueuedChat({ sessionId: app.session.id, id: queued.clientMessageId });
  await app.api.rewindChat(target(0));
  expect(await contents()).toEqual(app.repositories.map(() => 'Original content'));
});

it('rejects an intermediate partial repository receipt before forking or restoring history', async () => {
  const checkpoint = app.session.checkpoints?.[1];
  const repository = app.repositories.at(-1);
  if (!checkpoint?.postHeads || !repository) throw new Error('Missing captured history');
  checkpoint.postHeads = Object.fromEntries(
    Object.entries(checkpoint.postHeads).filter(([path]) => path !== repository),
  );
  await app.store.saveSession(app.session);
  const originalHeads = await heads();
  await expect(app.api.rewindChat(target(0))).rejects.toMatchObject(appFailure('appUndoUnverified'));
  expect(app.agent.forkBefore).not.toHaveBeenCalled();
  expect(await heads()).toEqual(originalHeads);
  expect(await app.store.getSession(app.session.id)).toEqual(app.session);
});

it('branches through the selected response without old file rights and hydrates only the exact selected session', async () => {
  const originalHeads = await heads();
  const providerMessages = app.session.messages.filter(
    (message) => !message.appMessage && ['history-1', 'history-2'].includes(message.turnId ?? ''),
  );
  const provider = {
    id: 'branched-history',
    turnIds: ['history-1', 'history-2'],
    messages: providerMessages,
  };
  app.agent.forkThrough.mockResolvedValue(provider);
  const branch = await app.api.forkChat({ sessionId: app.session.id, messageId: 'answer-2' });
  expect(app.agent.forkThrough).toHaveBeenCalledExactlyOnceWith('original-history', 'history-2');
  expect(branch.id).not.toBe(app.session.id);
  expect(branch.branch).toEqual({ parentId: app.session.id, messageId: 'answer-2' });
  expect(branch.threadId).toBe(provider.id);
  expect(branch.checkpoints).toEqual([]);
  expect(branch.messages.filter((message) => message.role === 'user').map((message) => message.id)).toEqual(
    app.users.slice(0, 2).map((message) => message.id),
  );
  expect(branch.messages.some((message) => message.turnId === 'history-3')).toBe(false);
  expect(await app.store.getSession(app.session.id)).toEqual(app.session);
  expect(await heads()).toEqual(originalHeads);
  const recovered = {
    ...providerMessages[0],
    id: 'branch-only-answer',
    role: 'assistant' as const,
    turnId: 'history-2',
    text: 'Provider-only branch history',
    files: [],
    createdAt: '2026-10-07T12:00:00Z',
  };
  app.agent.readThread.mockImplementation((id) =>
    Promise.resolve({
      id,
      messages: id === provider.id ? [...providerMessages, recovered] : app.session.messages,
      turnIds: id === provider.id ? provider.turnIds : ['history-1', 'history-2', 'history-3'],
    }),
  );
  const input = { scope: app.scope, topic: app.session.topic, title: app.session.title };
  const selected = await app.api.openChat({ ...input, sessionId: branch.id });
  expect(selected.id).toBe(branch.id);
  expect(selected.messages).toContainEqual(recovered);
  expect(selected.checkpoints).toEqual([]);
  const canonical = await app.api.openChat(input);
  expect(canonical.id).toBe(app.session.id);
  expect(canonical.messages.some((message) => message.id === recovered.id)).toBe(false);
  app.agent.readThread.mockClear();
  await expect(
    app.api.openChat({ ...input, topic: 'another-topic', sessionId: branch.id }),
  ).rejects.toMatchObject(appFailure('untrustedRequest'));
  expect(app.agent.readThread).not.toHaveBeenCalled();
  expect((await app.store.getSession(branch.id)).messages).toEqual(selected.messages);
});
