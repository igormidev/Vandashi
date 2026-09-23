import { setImmediate } from 'node:timers/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AgentThread } from '../src/domain/agent';
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

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

for (const consumer of ['creation', 'clip'] as const) {
  for (const fails of [false, true]) {
    it(`${consumer} preview waits for completed-turn history hydration, including ${fails ? 'failed' : 'successful'} provider reads`, async () => {
      if (consumer === 'creation') await app.api.sendChat(app.request);
      const scope =
        consumer === 'clip'
          ? { ...app.scope, clipId: (await app.api.createClip(app.input)).clip.id }
          : app.scope;
      await app.idle();
      const session = (await app.store.sessions(scope))[0];
      if (!session?.threadId) throw new Error('Missing generation conversation');
      const held = deferred<AgentThread>();
      const thread: AgentThread = { id: session.threadId, messages: [], turnIds: [] };
      app.agent.readThread.mockImplementationOnce(() => held.promise);
      const hydration = app.api
        .openChat({ scope, topic: session.topic, title: session.title })
        .catch((error: unknown) => error);
      await vi.waitFor(() => {
        expect(app.agent.readThread).toHaveBeenCalled();
      });
      const read = vi.spyOn(app.store, 'openWorkspace');
      let settled = false;
      const preview = app.api.startStudio(scope).then(
        (value) => {
          settled = true;
          return value;
        },
        (error: unknown) => {
          settled = true;
          return error;
        },
      );
      try {
        await setImmediate();
        expect(settled).toBe(false);
        expect(read).not.toHaveBeenCalled();
        expect(app.media.startStudio).not.toHaveBeenCalled();
        if (fails) held.reject(new Error('Provider history unavailable'));
        else held.resolve(thread);
        await hydration;
        await expect(preview).resolves.toHaveProperty(
          'previewUrl',
          'http://127.0.0.1:3000/preview/index.html',
        );
        expect(app.media.startStudio).toHaveBeenCalledExactlyOnceWith(await app.store.projectPath(scope));
        expect((await app.git.status(await app.store.projectPath(scope))).dirty).toBe(false);
      } finally {
        held.resolve(thread);
        await hydration;
        await preview;
      }
    });
  }
}
