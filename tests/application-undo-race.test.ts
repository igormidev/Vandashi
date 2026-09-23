import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
let brand: string;
beforeEach(async () => {
  app = await applicationFixture();
  const first = (await app.store.repositories(app.scope))[0];
  if (!first) throw new Error('Missing brand');
  brand = first;
  app.agent.run.mockImplementationOnce(async (_, emit) => {
    emit({ type: 'thread', threadId: 'original' });
    emit({ type: 'turn', turnId: 'undo-turn' });
    await writeFile(join(brand, 'turn.md'), 'Brand turn content');
    await writeFile(join(app.path, 'script.md'), 'Video turn content');
    return { threadId: 'original', turnId: 'undo-turn', status: 'completed', error: null, output: '' };
  });
  await app.api.sendChat(app.request);
  await app.idle();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

it.each(['commit', 'dirty'] as const)(
  'preserves external $0 work arriving while the provider forks',
  async (kind) => {
    const history = await app.store.getSession(app.session.id);
    app.agent.forkBefore.mockImplementationOnce(async () => {
      await writeFile(join(app.path, 'script.md'), 'External during fork');
      if (kind === 'commit') await app.git.commit(app.path, 'External update', 'Preserve later work.');
      return { id: 'orphan-fork', messages: [], turnIds: [] };
    });
    const restore = vi.spyOn(app.git, 'restore');
    await expect(app.api.undoChat(app.session.id)).rejects.toMatchObject({
      diagnostic: {
        kind: 'app',
        message: { id: kind === 'commit' ? 'appUndoLaterChanges' : 'appSaveBeforeUndo' },
      },
    });
    expect(restore).not.toHaveBeenCalled();
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe('External during fork');
    expect(await app.store.getSession(app.session.id)).toEqual(history);
  },
);

it('compensates only owned writes when a later repository gains an external commit', async () => {
  const before = await app.store.getSession(app.session.id);
  const restore = app.git.restore.bind(app.git);
  let externalHead = '';
  let injected = false;
  vi.spyOn(app.git, 'restore').mockImplementation(async (path, revision, expected) => {
    const owned = await restore(path, revision, expected);
    if (path === brand && !injected) {
      injected = true;
      await writeFile(join(app.path, 'script.md'), 'External between repositories');
      externalHead = await app.git.commit(app.path, 'External update', 'Preserve later work.');
    }
    return owned;
  });
  await expect(app.api.undoChat(app.session.id)).rejects.toThrow('Reverting the turn failed');
  expect(await app.git.head(app.path)).toBe(externalHead);
  expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe('External between repositories');
  expect(await readFile(join(brand, 'turn.md'), 'utf8')).toBe('Brand turn content');
  const after = await app.store.getSession(app.session.id);
  expect(after.messages).toEqual(before.messages);
  expect(after.threadId).toBe(before.threadId);
  expect(after.checkpoints?.at(-1)?.postHeads?.[app.path]).toBe(
    before.checkpoints?.at(-1)?.postHeads?.[app.path],
  );
  expect(after.checkpoints?.at(-1)?.postHeads?.[brand]).toBe(await app.git.head(brand));
  await expect(app.api.undoChat(app.session.id)).rejects.toThrow('after this turn');
});

it.each(['commit', 'dirty'] as const)(
  'preserves external $0 work when history fails and compensation begins',
  async (kind) => {
    const before = await app.store.getSession(app.session.id);
    vi.spyOn(app.store, 'saveSession').mockImplementationOnce(async () => {
      await writeFile(join(app.path, 'script.md'), 'External during history save');
      if (kind === 'commit') await app.git.commit(app.path, 'External update', 'Preserve later work.');
      throw new Error('History unavailable');
    });
    await expect(app.api.undoChat(app.session.id)).rejects.toThrow('Reverting the turn failed');
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe('External during history save');
    expect(await readFile(join(brand, 'turn.md'), 'utf8')).toBe('Brand turn content');
    const after = await app.store.getSession(app.session.id);
    expect(after.messages).toEqual(before.messages);
    expect(after.threadId).toBe(before.threadId);
    expect(after.checkpoints?.at(-1)?.postHeads?.[app.path]).toBe(
      before.checkpoints?.at(-1)?.postHeads?.[app.path],
    );
  },
);
