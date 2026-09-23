import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { applicationFixture, type ApplicationFixture } from './application-fixture';
import type { Clip } from '../src/domain/models';

let app: ApplicationFixture;
let clips: Clip[];
beforeEach(async () => {
  app = await applicationFixture();
  clips = [];
  for (const name of ['First clip', 'Sibling clip'])
    clips.push(
      await app.store.createClip({
        scope: app.scope,
        name,
        ratio: '9:16',
        start: 0,
        end: 20,
      }),
    );
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

it.each(['parent', 'selected clip'] as const)(
  'captures, commits, reports, and undoes every writable child from a $0 turn',
  async (origin) => {
    const first = clips[0];
    if (!first) throw new Error('Missing first clip');
    const session =
      origin === 'parent'
        ? app.session
        : await app.api.openChat({
            scope: { ...app.scope, clipId: first.id },
            topic: 'clip',
            title: 'Clip',
          });
    const paths = [app.path, ...clips.map((clip) => clip.path)];
    const initial = await Promise.all(paths.map((path) => readFile(join(path, 'script.md'), 'utf8')));
    app.agent.run.mockImplementationOnce(async (input, emit) => {
      expect(input.writableRoots).toEqual(expect.arrayContaining(paths));
      emit({ type: 'thread', threadId: 'descendants' });
      emit({ type: 'turn', turnId: 'descendants-turn' });
      for (const [index, path] of paths.entries())
        await writeFile(join(path, 'script.md'), `Changed ${String(index)}`);
      if (origin === 'parent')
        await app.git.commit(first.path, 'Agent clip edit', 'Save directly inside the child repository.');
      return {
        threadId: 'descendants',
        turnId: 'descendants-turn',
        status: 'completed',
        error: null,
        output: '',
      };
    });
    await app.api.sendChat({ ...app.request, sessionId: session.id });
    await app.idle();
    const saved = await app.store.getSession(session.id);
    const checkpoint = saved.checkpoints?.at(-1);
    const receipt = saved.messages.find((message) => message.appMessage?.id === 'turnSaved');
    expect(receipt?.files.map((file) => file.path)).toEqual(
      expect.arrayContaining(paths.map((path) => join(path, 'script.md'))),
    );
    for (const path of paths) {
      expect(checkpoint?.heads[path]).toBeTruthy();
      expect(checkpoint?.postHeads?.[path]).toBe(await app.git.head(path));
      expect((await app.git.status(path)).dirty).toBe(false);
    }
    await app.api.undoChat(session.id);
    expect(await Promise.all(paths.map((path) => readFile(join(path, 'script.md'), 'utf8')))).toEqual(
      initial,
    );
  },
);

it('blocks a parent turn on a dirty child before accepting a message', async () => {
  const child = clips[1];
  if (!child) throw new Error('Missing child');
  await writeFile(join(child.path, 'script.md'), 'External child draft');
  const history = await app.store.getSession(app.session.id);
  await expect(app.api.sendChat(app.request)).rejects.toThrow('Save pending file changes');
  expect(app.agent.run).not.toHaveBeenCalled();
  expect(await app.store.getSession(app.session.id)).toEqual(history);
  expect(await readFile(join(child.path, 'script.md'), 'utf8')).toBe('External child draft');
});

it('commits child work after an interrupted parent turn without a success receipt', async () => {
  const child = clips[1];
  if (!child) throw new Error('Missing child');
  app.agent.run.mockImplementationOnce(async (_, emit) => {
    emit({ type: 'thread', threadId: 'interrupted' });
    emit({ type: 'turn', turnId: 'interrupted-turn' });
    await writeFile(join(child.path, 'script.md'), 'Partially completed child work');
    return {
      threadId: 'interrupted',
      turnId: 'interrupted-turn',
      status: 'interrupted',
      error: null,
      output: '',
    };
  });
  await app.api.sendChat(app.request);
  await app.idle();
  expect((await app.git.status(child.path)).dirty).toBe(false);
  const session = await app.store.getSession(app.session.id);
  expect(session.checkpoints?.at(-1)?.postHeads?.[child.path]).toBe(await app.git.head(child.path));
  expect(session.messages.some((message) => message.appMessage?.id === 'turnSaved')).toBe(false);
});
