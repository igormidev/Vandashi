import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stringify } from 'yaml';
import { diagnosticFromError } from '../src/domain/diagnostics';
import { AgentError } from '../src/domain/agent';
import { publishSessionFixture, type PublishSessionFixture } from './publish-session-fixture';

let fixture: PublishSessionFixture;
beforeEach(async () => {
  fixture = await publishSessionFixture();
});
afterEach(async () => {
  await fixture.app.idle();
  await fixture.app.cleanup();
});

it('rejects an external dirty clip after preparation before a turn or transcript change', async () => {
  const { app, clip, request, prepared } = fixture;
  await writeFile(join(clip.path, 'script.md'), 'An unsaved external change.');
  await expect(app.api.sendChat(request)).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'appSaveBeforeAi' } },
  });
  expect(app.agent.run).not.toHaveBeenCalled();
  expect(await app.store.getSession(prepared.session.id)).toEqual(prepared.session);
  expect(await readFile(join(clip.path, 'script.md'), 'utf8')).toBe('An unsaved external change.');
});

it.each(['stale', 'missing'] as const)('rechecks %s clip media at send time', async (change) => {
  const { app, clip, renderedPath, request, prepared } = fixture;
  if (change === 'stale') {
    await writeFile(join(clip.path, 'script.md'), 'A committed newer scene.');
    await app.git.commit(clip.path, 'Change scene', 'Invalidate the old render after review.');
  } else await rm(renderedPath);
  await expect(app.api.sendChat(request)).rejects.toThrow('Render');
  expect(app.agent.run).not.toHaveBeenCalled();
  expect(await app.store.getSession(prepared.session.id)).toEqual(prepared.session);
});

it('rejects a missing or malformed clip target instead of falling back to its parent', async () => {
  const { app, prepared, request } = fixture;
  for (const topic of ['publish:youtubeShorts:missing', 'publish:youtubeShorts:', 'publish:x:clip:extra']) {
    const session = { ...prepared.session, topic };
    await app.store.saveSession(session);
    await expect(app.api.sendChat(request)).rejects.toThrow('clip');
    expect(await app.store.getSession(session.id)).toEqual(session);
  }
  expect(app.agent.run).not.toHaveBeenCalled();
});

it.each(['completed', 'interrupted', 'legacy'] as const)(
  'preserves %s publishing effects and prevents generic undo before Git or provider mutation',
  async (outcome) => {
    const { app, clip, scope, prepared, request } = fixture;
    const ledger = join(app.path, 'launch.yml');
    const prior = (await app.store.openWorkspace(app.scope)).launches;
    app.agent.run.mockImplementationOnce(async (input, emit) => {
      expect(input.cwd).toBe(clip.path);
      expect(input.writableRoots).toEqual(await app.store.repositories(scope));
      const quotedTarget = /PRIMARY TARGET: ("(?:\\.|[^"\\])*")\./u.exec(input.prompt)?.[1];
      const target: unknown = JSON.parse(quotedTarget ?? 'null');
      if (typeof target !== 'string') throw new Error('Missing primary publication target');
      expect(normalize(target)).toBe(normalize(ledger));
      expect(input.prompt).toContain(JSON.stringify(clip.path));
      expect(input.prompt).toContain(JSON.stringify(fixture.renderedPath));
      emit({ type: 'thread', threadId: 'publication-thread' });
      emit({ type: 'turn', turnId: 'publication-turn' });
      await writeFile(join(clip.path, 'script.md'), 'Clip work performed during publication.');
      await writeFile(
        ledger,
        stringify([
          ...prior,
          {
            platform: 'youtubeShorts',
            status: outcome === 'interrupted' ? 'uploading' : 'uploaded',
            url: outcome === 'interrupted' ? '' : 'https://youtube.com/shorts/fixture',
            clipId: clip.id,
          },
        ]),
      );
      return {
        threadId: 'publication-thread',
        turnId: 'publication-turn',
        status: outcome === 'interrupted' ? 'interrupted' : 'completed',
        output: '',
        error: null,
      };
    });
    await app.api.sendChat(request);
    await app.idle();
    const saved = await app.store.getSession(prepared.session.id);
    expect(saved.scope).toEqual(app.scope);
    expect((await app.store.sessions(app.scope)).some((session) => session.id === saved.id)).toBe(true);
    expect((await app.store.sessions(scope)).some((session) => session.id === saved.id)).toBe(false);
    const checkpoint = saved.checkpoints?.at(-1);
    expect(checkpoint?.mode).toBe('edit');
    expect(checkpoint?.heads).toHaveProperty(clip.path);
    expect(checkpoint?.heads).toHaveProperty(app.path);
    expect(checkpoint?.postHeads?.[clip.path]).toBe(await app.git.head(clip.path));
    for (const repository of await app.store.repositories(scope))
      expect((await app.git.status(repository)).dirty).toBe(false);
    if (outcome === 'legacy') {
      if (!checkpoint) throw new Error('Missing checkpoint');
      delete checkpoint.mode;
      await app.store.saveSession(saved);
    }
    const history = await app.store.getSession(saved.id);
    const beforeLedger = await readFile(ledger, 'utf8');
    const beforeClip = await readFile(join(clip.path, 'script.md'), 'utf8');
    const beforeHeads = await Promise.all(
      (await app.store.repositories(scope)).map((repo) => app.git.head(repo)),
    );
    const restore = vi.spyOn(app.git, 'restore');
    const failure: unknown = await app.api.undoChat(saved.id).catch((error: unknown) => error);
    expect(diagnosticFromError(failure)).toEqual({
      kind: 'app',
      message: { id: 'appPublishUndoUnavailable' },
    });
    expect(app.agent.forkBefore).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(await app.store.getSession(saved.id)).toEqual(history);
    expect(await readFile(ledger, 'utf8')).toBe(beforeLedger);
    expect(await readFile(join(clip.path, 'script.md'), 'utf8')).toBe(beforeClip);
    expect(
      await Promise.all((await app.store.repositories(scope)).map((repo) => app.git.head(repo))),
    ).toEqual(beforeHeads);
    expect((await app.store.openWorkspace(app.scope)).launches[0]).toEqual(prior[0]);
  },
);

it('reconciles clip and parent files after an uncertain unacknowledged publishing start', async () => {
  const { app, clip, request } = fixture;
  app.agent.run.mockImplementationOnce(async () => {
    await writeFile(join(clip.path, 'script.md'), 'Preserved uncertain publication work.');
    await writeFile(join(app.path, 'publication-note.md'), 'External upload may have started.');
    throw new AgentError('uncertain-start', 'Acknowledgement was lost after the process stopped.');
  });
  await expect(app.api.sendChat(request)).rejects.toThrow('Acknowledgement');
  await app.idle();
  expect((await app.git.status(clip.path)).dirty).toBe(false);
  expect((await app.git.status(app.path)).dirty).toBe(false);
  expect(await readFile(join(clip.path, 'script.md'), 'utf8')).toContain('Preserved');
});

it('keeps an explicitly read-only publication turn reversible without changing the ledger', async () => {
  const { app, request } = fixture;
  const before = await readFile(join(app.path, 'launch.yml'), 'utf8');
  await app.api.sendChat({ ...request, mode: 'read' });
  await app.idle();
  expect((await app.store.getSession(request.sessionId)).checkpoints?.at(-1)?.mode).toBe('read');
  await app.api.undoChat(request.sessionId);
  expect(app.agent.forkBefore).toHaveBeenCalledOnce();
  expect(await readFile(join(app.path, 'launch.yml'), 'utf8')).toBe(before);
});

it('does not expose an older read checkpoint after a later uncertain publication start', async () => {
  const { app, request } = fixture;
  await app.api.sendChat({ ...request, mode: 'read' });
  await app.idle();
  app.agent.run.mockRejectedValueOnce(new AgentError('uncertain-start', 'Provider acknowledgement lost.'));
  await expect(app.api.sendChat(request)).rejects.toThrow('acknowledgement');
  await app.idle();
  const history = await app.store.getSession(request.sessionId);
  await expect(app.api.undoChat(request.sessionId)).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'appPublishUndoUnavailable' } },
  });
  expect(app.agent.forkBefore).not.toHaveBeenCalled();
  expect(await app.store.getSession(request.sessionId)).toEqual(history);
});
