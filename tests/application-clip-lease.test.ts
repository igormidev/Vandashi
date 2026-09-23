import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AgentError } from '../src/domain/agent';
import type { Clip, Scope } from '../src/domain/models';
import { clipCreationFixture, type ClipCreationFixture } from './clip-creation-fixture';

let app: ClipCreationFixture;
beforeEach(async () => {
  app = await clipCreationFixture();
});
afterEach(async () => {
  await app.idle();
  vi.restoreAllMocks();
  await app.cleanup();
});
function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('holds one lease from publication through hydration, accepted startup and final persistence', async () => {
  const hydration = deferred();
  const completion = deferred();
  const persistence = deferred();
  const reached = deferred();
  let clipScope: Scope | undefined;
  let finalWrite = false;
  const read = app.store.openWorkspace.bind(app.store);
  vi.spyOn(app.store, 'openWorkspace').mockImplementation(async (scope) => {
    if (scope.clipId && !clipScope) {
      clipScope = scope;
      reached.resolve();
      await hydration.promise;
    }
    return read(scope);
  });
  const save = app.store.saveSession.bind(app.store);
  vi.spyOn(app.store, 'saveSession').mockImplementation(async (session) => {
    if (session.scope.clipId && session.messages.some((entry) => entry.appMessage?.id === 'turnUnchanged')) {
      finalWrite = true;
      await persistence.promise;
    }
    return save(session);
  });
  app.agent.run.mockImplementation(async (_input, event) => {
    event({ type: 'thread', threadId: 'clip-thread' });
    event({ type: 'turn', turnId: 'clip-turn' });
    await completion.promise;
    return { threadId: 'clip-thread', turnId: 'clip-turn', status: 'completed', error: null, output: '' };
  });
  app.events.length = 0;
  const creating = app.api.createClip(app.input);
  const expectLocked = async () => {
    await expect(
      app.api.createVideo({ brandId: app.scope.brandId, name: 'Overlapping video', ratio: '16:9' }),
    ).rejects.toMatchObject({ diagnostic: { message: { id: 'appOperationBusy' } } });
    expect(app.events.filter((event) => event.type === 'workspace-changed')).toEqual([]);
    expect(
      app.events.filter((event) => event.type === 'activity' && event.activity.phase === 'done'),
    ).toEqual([]);
  };
  try {
    await reached.promise;
    expect(app.agent.run).not.toHaveBeenCalled();
    await expectLocked();
    hydration.resolve();
    const result = await creating;
    expect(result.generation.status).toBe('started');
    await expectLocked();
    if (!clipScope) throw new Error('Missing clip scope');
    // The renderer can immediately open the accepted clip from the gated snapshot cache.
    expect((await app.api.openWorkspace(clipScope)).video?.id).toBe(result.clip.id);
    completion.resolve();
    // Reconciliation performs real Git work in every repository before reaching the held final write.
    await vi.waitFor(
      () => {
        expect(finalWrite).toBe(true);
      },
      { timeout: 10_000, interval: 25 },
    );
    await expectLocked();
    persistence.resolve();
    await app.idle();
    const refreshed = app.events.flatMap((event) =>
      event.type === 'workspace-changed' ? [event.scope] : [],
    );
    expect(refreshed).toContainEqual(app.scope);
    expect(refreshed).toContainEqual(clipScope);
    expect((await app.git.status(result.clip.path)).dirty).toBe(false);
  } finally {
    hydration.resolve();
    completion.resolve();
    persistence.resolve();
    await creating;
  }
});

it('keeps the accepted clip locked until failed hydration settles, then returns its receipt once', async () => {
  const hydration = deferred();
  const reached = deferred();
  let published: Clip | undefined;
  const create = app.store.createClip.bind(app.store);
  vi.spyOn(app.store, 'createClip').mockImplementation(async (...args) => {
    published = await create(...args);
    return published;
  });
  const read = app.store.openWorkspace.bind(app.store);
  vi.spyOn(app.store, 'openWorkspace').mockImplementation(async (scope) => {
    if (scope.clipId) {
      reached.resolve();
      await hydration.promise;
      throw new Error('Snapshot unavailable');
    }
    return read(scope);
  });
  app.events.length = 0;
  const creating = app.api.createClip(app.input);
  try {
    await reached.promise;
    await expect(app.api.openBrand(app.scope.brandId)).rejects.toMatchObject({
      diagnostic: { message: { id: 'appOperationBusy' } },
    });
    expect(app.events.some((event) => event.type === 'activity' && event.activity.phase === 'done')).toBe(
      false,
    );
    hydration.resolve();
    const result = await creating;
    expect(result).toMatchObject({ clip: published, generation: { status: 'failed' } });
    await app.idle();
    expect(app.agent.run).not.toHaveBeenCalled();
    expect(app.events.filter((event) => event.type === 'workspace-changed')).toEqual([
      { type: 'workspace-changed', scope: app.scope },
    ]);
    expect((await app.git.status(result.clip.path)).dirty).toBe(false);
  } finally {
    hydration.resolve();
    await creating;
  }
});

it('waits for uncertain startup shutdown and saves partial clip work before releasing the lease', async () => {
  const stopped = deferred();
  const started = deferred();
  let clipPath = '';
  app.agent.run.mockImplementationOnce(async (input, event) => {
    clipPath = input.cwd;
    event({ type: 'thread', threadId: 'uncertain-clip' });
    await writeFile(join(input.cwd, 'partial.txt'), 'Preserve unfinished clip edits');
    started.resolve();
    await stopped.promise;
    throw new AgentError('uncertain-start', 'Start acknowledgement lost; process stopped.');
  });
  app.events.length = 0;
  const creating = app.api.createClip(app.input);
  try {
    await started.promise;
    await expect(app.api.closeChat(app.session.id)).rejects.toMatchObject({
      diagnostic: { message: { id: 'appOperationBusy' } },
    });
    expect((await app.git.status(clipPath)).dirty).toBe(true);
    expect(app.events.some((event) => event.type === 'activity' && event.activity.phase === 'done')).toBe(
      false,
    );
    stopped.resolve();
    const result = await creating;
    expect(result.generation.status).toBe('failed');
    await app.idle();
    expect(await readFile(join(result.clip.path, 'partial.txt'), 'utf8')).toBe(
      'Preserve unfinished clip edits',
    );
    expect((await app.git.status(result.clip.path)).dirty).toBe(false);
    const session = (await app.store.sessions({ ...app.scope, clipId: result.clip.id }))[0];
    expect(session?.messages.map((entry) => entry.role)).toEqual(['user', 'error']);
    expect(session?.checkpoints ?? []).toEqual([]);
  } finally {
    stopped.resolve();
    await creating;
  }
});
