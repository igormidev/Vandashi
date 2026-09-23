import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunResult } from '../src/domain/agent';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.cleanup();
});
const completed: AgentRunResult = {
  threadId: 'held-list-thread',
  turnId: 'held-list-turn',
  status: 'completed',
  error: null,
  output: '',
};

describe('repair-capable video list reads', () => {
  it.each(['chat', 'checks', 'create'] as const)(
    'waits for %s before touching half-written packaging',
    async (operation) => {
      const entered = deferred<undefined>();
      const release = deferred<undefined>();
      if (operation === 'chat')
        app.agent.run.mockImplementationOnce(async (_input, emit) => {
          emit({ type: 'thread', threadId: completed.threadId });
          emit({ type: 'turn', turnId: completed.turnId });
          entered.resolve(undefined);
          await release.promise;
          return completed;
        });
      if (operation === 'checks')
        app.agent.connect.mockImplementationOnce(async () => {
          entered.resolve(undefined);
          await release.promise;
          return {
            connected: true,
            authenticated: true,
            accountType: 'test',
            usageAllowed: true,
            version: 'test',
          };
        });
      if (operation === 'create')
        app.media.seedProject.mockImplementationOnce(async () => {
          entered.resolve(undefined);
          await release.promise;
        });
      const active =
        operation === 'chat'
          ? app.api.sendChat(app.request)
          : operation === 'checks'
            ? app.api.checks({ scope: app.scope, video: false })
            : app.api.createVideo({ brandId: app.scope.brandId, name: 'Another video', ratio: '16:9' });
      await entered.promise;
      const path = join(app.path, 'video_packaging.yml');
      const original = await readFile(path);
      const head = await app.git.head(app.path);
      const read = vi.spyOn(app.store, 'listVideos');
      let list: ReturnType<typeof app.api.listVideos> | undefined;
      try {
        await writeFile(path, 'half-written: [');
        list = app.api.listVideos(app.scope.brandId);
        expect(app.api.listVideos(app.scope.brandId)).toBe(list);
        await Promise.resolve();
        expect(read).not.toHaveBeenCalled();
        expect(await readFile(path, 'utf8')).toBe('half-written: [');
        expect(await app.git.head(app.path)).toBe(head);
      } finally {
        await writeFile(path, original);
        release.resolve(undefined);
        await active;
        if (operation === 'chat') await app.idle();
        await list;
      }
      expect(read).toHaveBeenCalledOnce();
      expect((await list).map((video) => video.name)).toContain('Video');
      expect(await readFile(path)).toEqual(original);
    },
  );

  it.each(['checks', 'create'] as const)(
    'holds its lease until storage settles before %s starts',
    async (operation) => {
      const entered = deferred<undefined>();
      const release = deferred<undefined>();
      const original = app.store.listVideos.bind(app.store);
      const read = vi.spyOn(app.store, 'listVideos').mockImplementationOnce(async (brandId) => {
        entered.resolve(undefined);
        await release.promise;
        return original(brandId);
      });
      const list = app.api.listVideos(app.scope.brandId);
      await entered.promise;
      const connectBefore = app.agent.connect.mock.calls.length;
      const active =
        operation === 'checks'
          ? app.api.checks({ scope: app.scope, video: false })
          : app.api.createVideo({ brandId: app.scope.brandId, name: 'After list', ratio: '16:9' });
      try {
        await expect(app.api.sendChat(app.request)).rejects.toMatchObject({
          diagnostic: { message: { id: 'appOperationBusy' } },
        });
        expect(read).toHaveBeenCalledOnce();
        expect(app.agent.connect).toHaveBeenCalledTimes(connectBefore);
        expect(app.media.seedProject).not.toHaveBeenCalled();
      } finally {
        release.resolve(undefined);
        await list;
        await active;
      }
      if (operation === 'checks') expect(app.agent.connect).toHaveBeenCalledTimes(connectBefore + 1);
      else expect(app.media.seedProject).toHaveBeenCalledOnce();
    },
  );

  it('releases a failed read and its coalesced promise so explicit retry can repair and succeed', async () => {
    const read = vi.spyOn(app.store, 'listVideos').mockRejectedValueOnce(new Error('List unavailable'));
    const first = app.api.listVideos(app.scope.brandId);
    expect(app.api.listVideos(app.scope.brandId)).toBe(first);
    await expect(first).rejects.toThrow('List unavailable');
    await writeFile(join(app.path, 'video_packaging.yml'), 'invalid: [');
    expect((await app.api.listVideos(app.scope.brandId)).map((video) => video.name)).toEqual(['Video']);
    expect(read).toHaveBeenCalledTimes(2);
    expect(await readFile(join(app.path, 'video_packaging.yml'), 'utf8')).not.toBe('invalid: [');
    await expect(app.api.resetChat(app.session.id)).resolves.toMatchObject({ id: app.session.id });
  });
});
