import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunResult } from '../src/domain/agent';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise was not initialized');
  };
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
  app.media.renderVideo.mockImplementation(async () => {
    await mkdir(join(app.path, 'renders'), { recursive: true });
    const path = join(app.path, 'renders', 'output.mp4');
    await writeFile(path, 'Rendered fixture media');
    return path;
  });
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

const busy = { diagnostic: { kind: 'app', message: { id: 'appOperationBusy' } } };
const completed: AgentRunResult = {
  threadId: 'held-thread',
  turnId: 'held-turn',
  status: 'completed',
  error: null,
  output: '',
};

describe.each(['startStudio', 'renderVideo'] as const)('%s workspace preflight', (operation) => {
  it('owns the operation lease before awaiting a workspace read that may mutate files', async () => {
    const original = app.store.openWorkspace.bind(app.store);
    const entered = deferred<undefined>();
    const held = deferred<undefined>();
    const read = vi.spyOn(app.store, 'openWorkspace').mockImplementationOnce(async (scope) => {
      entered.resolve(undefined);
      await held.promise;
      return original(scope);
    });
    const result = app.api[operation](app.scope).catch((error: unknown) => error);
    await entered.promise;
    try {
      await expect(app.api.sendChat(app.request)).rejects.toMatchObject(busy);
      await expect(app.api[operation](app.scope)).rejects.toMatchObject(busy);
      expect(app.agent.run).not.toHaveBeenCalled();
      expect(read).toHaveBeenCalledOnce();
      expect(app.media.startStudio).not.toHaveBeenCalled();
      expect(app.media.renderVideo).not.toHaveBeenCalled();
    } finally {
      held.resolve(undefined);
      await result;
    }
    expect(await result).not.toBeInstanceOf(Error);
    expect(app.media[operation]).toHaveBeenCalledOnce();
    await expect(app.api.resetChat(app.session.id)).resolves.toMatchObject({ id: app.session.id });
  });

  it('rejects during an accepted chat without repairing its half-written packaging', async () => {
    const held = deferred<AgentRunResult>();
    app.agent.run.mockImplementationOnce((_input, emit) => {
      emit({ type: 'thread', threadId: completed.threadId });
      emit({ type: 'turn', turnId: completed.turnId });
      return held.promise;
    });
    await app.api.sendChat(app.request);
    const path = join(app.path, 'video_packaging.yml');
    const original = await readFile(path, 'utf8');
    const read = vi.spyOn(app.store, 'openWorkspace');
    try {
      await writeFile(path, 'temporarily: [');
      await expect(app.api[operation](app.scope)).rejects.toMatchObject(busy);
      expect(await readFile(path, 'utf8')).toBe('temporarily: [');
      expect(read).not.toHaveBeenCalled();
      expect(app.media.startStudio).not.toHaveBeenCalled();
      expect(app.media.renderVideo).not.toHaveBeenCalled();
    } finally {
      await writeFile(path, original);
      held.resolve(completed);
      await app.idle();
    }
    expect((await app.git.status(app.path)).dirty).toBe(false);
  });

  it('rejects imported media inside the lease and releases it for a later operation', async () => {
    const sourcePath = join(app.root, 'finished.mp4');
    await writeFile(sourcePath, 'Original imported video');
    const imported = await app.api.importFinishedVideo({
      brandId: app.scope.brandId,
      name: 'Imported release',
      sourcePath,
    });
    const priorEvents = app.events.length;
    await expect(app.api[operation](imported.scope)).rejects.toMatchObject({
      diagnostic: {
        kind: 'app',
        message: { id: operation === 'startStudio' ? 'appImportedNoComposition' : 'appFinishedNoRender' },
      },
    });
    expect(app.media.startStudio).not.toHaveBeenCalled();
    expect(app.media.renderVideo).not.toHaveBeenCalled();
    const activity = app.events.slice(priorEvents).filter((event) => event.type === 'activity');
    expect(activity.map((event) => event.activity.phase)).toEqual(['working', 'done']);
    await expect(app.api.resetChat(app.session.id)).resolves.toMatchObject({ id: app.session.id });
    expect(await readFile(sourcePath, 'utf8')).toBe('Original imported video');
  });

  it('releases its lease when storage preflight fails before any media action', async () => {
    vi.spyOn(app.store, 'openWorkspace').mockRejectedValueOnce(new Error('Storage preflight failed'));
    await expect(app.api[operation](app.scope)).rejects.toThrow('Storage preflight failed');
    expect(app.media.startStudio).not.toHaveBeenCalled();
    expect(app.media.renderVideo).not.toHaveBeenCalled();
    await expect(app.api.resetChat(app.session.id)).resolves.toMatchObject({ id: app.session.id });
    await expect(app.api[operation](app.scope)).resolves.toBeDefined();
    expect(app.media[operation]).toHaveBeenCalledOnce();
  });
});
