import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

async function edit(text: string, turn: string) {
  vi.mocked(app.agent.run).mockImplementationOnce(async (_input, event) => {
    event({ type: 'thread', threadId: 'thread' });
    event({ type: 'turn', turnId: turn });
    await writeFile(join(app.path, 'script.md'), text);
    return { threadId: 'thread', turnId: turn, status: 'completed', error: null, output: '' };
  });
  await app.api.sendChat({ ...app.request, text });
  await app.idle();
}

describe('durable checkpoints and recovery', () => {
  it('stops the preview before editing and commits normalized IDs before checkpointing', async () => {
    vi.mocked(app.agent.run).mockImplementationOnce(async (_input, event) => {
      expect(app.media.stopStudio).toHaveBeenCalledOnce();
      event({ type: 'thread', threadId: 'thread' });
      event({ type: 'turn', turnId: 'normalized' });
      await writeFile(join(app.path, 'index.html'), '<main><span>Nested scene</span></main>');
      return { threadId: 'thread', turnId: 'normalized', status: 'completed', error: null, output: '' };
    });
    vi.mocked(app.media.normalizeProject).mockImplementationOnce(async (path) => {
      const file = join(path, 'index.html');
      await writeFile(file, (await readFile(file, 'utf8')).replace('<span>', '<span data-hf-id="nested">'));
    });
    await app.api.sendChat(app.request);
    await app.idle();
    const postHead = (await app.store.getSession(app.session.id)).checkpoints?.[0]?.postHeads?.[app.path];
    expect(postHead).toBe(await app.git.head(app.path));
    expect(await app.git.readAt(app.path, postHead ?? '', 'index.html')).toContain('data-hf-id="nested"');
    expect((await app.git.status(app.path)).dirty).toBe(false);
  });

  it('keeps read-only conversations from stopping or normalizing the preview source', async () => {
    await app.api.sendChat({ ...app.request, mode: 'read', text: 'Explain the scene.' });
    await app.idle();
    expect(app.media.stopStudio).not.toHaveBeenCalled();
    expect(app.media.normalizeProject).not.toHaveBeenCalled();
  });

  it('preserves edited source even when normalization fails and denies an unverified undo', async () => {
    vi.mocked(app.media.normalizeProject).mockRejectedValueOnce(new Error('Invalid composition'));
    await edit('# Preserved invalid source', 'invalid');
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe('# Preserved invalid source');
    expect((await app.git.status(app.path)).dirty).toBe(false);
    expect((await app.store.getSession(app.session.id)).checkpoints?.[0]?.postHeads).toBeUndefined();
    await expect(app.api.undoChat(app.session.id)).rejects.toThrow('no verified file checkpoint');
    expect(
      app.events.some((event) => event.type === 'notice' && event.detail.includes('Invalid composition')),
    ).toBe(true);
    expect(app.events.find((event) => event.type === 'notice' && event.code === 'save-failed')).toMatchObject(
      {
        diagnostic: {
          kind: 'app',
          message: { id: 'appNormalizationFailed' },
          externalDetail: 'Invalid composition',
        },
      },
    );
  });

  it('undoes sequential turns from persisted checkpoints without rewinding Git history or crossing manual changes', async () => {
    const initial = await readFile(join(app.path, 'script.md'), 'utf8');
    await edit('# First', 'first');
    await edit('# Second', 'second');
    const second = await app.git.head(app.path);
    const session = await app.api.undoChat(app.session.id);
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe('# First');
    expect(await app.git.head(app.path)).not.toBe(second);
    expect(session.checkpoints).toHaveLength(1);
    expect(session.checkpoints?.[0]?.postHeads?.[app.path]).toBe(await app.git.head(app.path));
    await app.api.undoChat(app.session.id);
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe(initial);
    expect((await app.store.getSession(app.session.id)).messages).toHaveLength(0);
    expect(app.agent.forkBefore).toHaveBeenNthCalledWith(1, 'thread', 'second');
    expect(app.agent.forkBefore).toHaveBeenNthCalledWith(2, 'thread', 'first');
  });

  it('refuses an undo if any repository has later work before forking the conversation', async () => {
    await edit('# Turn', 'first');
    const brand = (await app.store.repositories(app.scope))[0];
    if (!brand) throw new Error('Missing brand fixture');
    await writeFile(join(brand, 'manual.md'), '# User manual change');
    await app.git.commit(brand, 'Manual brand change', 'Keep this later change.');
    await expect(app.api.undoChat(app.session.id)).rejects.toThrow('after this turn');
    expect(app.agent.forkBefore).not.toHaveBeenCalled();
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe('# Turn');
  });

  it('compensates a failed conversation save and preserves a retryable checkpoint', async () => {
    const initial = await readFile(join(app.path, 'script.md'), 'utf8');
    await edit('# Preserve me', 'first');
    vi.spyOn(app.store, 'saveSession').mockRejectedValueOnce(new Error('Disk briefly unavailable'));
    await expect(app.api.undoChat(app.session.id)).rejects.toThrow('Reverting the turn failed');
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe('# Preserve me');
    const recovered = await app.store.getSession(app.session.id);
    expect(recovered.threadId).toBe('thread');
    expect(recovered.checkpoints).toHaveLength(1);
    expect(recovered.checkpoints?.[0]?.postHeads?.[app.path]).toBe(await app.git.head(app.path));
    expect((await app.git.status(app.path)).dirty).toBe(false);
    await app.api.undoChat(app.session.id);
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe(initial);
  });

  it('does not let one failed streaming history write prevent final commit and checkpoint persistence', async () => {
    const save = app.store.saveSession.bind(app.store);
    let failed = false;
    vi.spyOn(app.store, 'saveSession').mockImplementation(async (session) => {
      if (!failed && session.checkpoints?.length && !session.checkpoints.at(-1)?.postHeads) {
        failed = true;
        throw new Error('Transient history failure');
      }
      await save(session);
    });
    await edit('# Survives write failure', 'first');
    expect(failed).toBe(true);
    const session = await app.store.getSession(app.session.id);
    expect(session.checkpoints?.[0]?.postHeads?.[app.path]).toBe(await app.git.head(app.path));
    expect((await app.git.status(app.path)).dirty).toBe(false);
    expect(session.messages[0]?.text).toBe('# Survives write failure');
    expect(
      app.events.find((event) => event.type === 'notice' && event.code === 'history-recovered'),
    ).toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'appHistorySavedAgain' } },
    });
  });

  it('preserves a staged script after the AI has accepted and then interrupted its turn', async () => {
    vi.mocked(app.agent.run).mockImplementationOnce((_input, event) => {
      event({ type: 'thread', threadId: 'thread' });
      event({ type: 'turn', turnId: 'first' });
      return Promise.resolve({
        threadId: 'thread',
        turnId: 'first',
        status: 'interrupted',
        error: 'Stopped',
        output: '',
      });
    });
    await app.api.saveScript({
      scope: app.scope,
      revision: app.workspace.revision,
      content: '# Approved script',
      guidance: '',
      selection: app.request.selection,
    });
    await app.idle();
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe('# Approved script');
    expect((await app.git.status(app.path)).dirty).toBe(false);
    expect((await app.store.getSession(app.session.id)).checkpoints?.[0]?.postHeads).toBeDefined();
  });
});

describe('Studio edit boundaries', () => {
  it('backs up discarded dirty edits and restores the editor baseline without losing history', async () => {
    await app.api.startStudio(app.scope);
    const initial = await readFile(join(app.path, 'script.md'), 'utf8');
    await writeFile(join(app.path, 'script.md'), '# Studio draft');
    await writeFile(join(app.path, 'new-scene.html'), '<h1>Scene</h1>');
    await app.api.discardStudio(app.scope);
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe(initial);
    expect((await app.git.status(app.path)).dirty).toBe(false);
    const history = (await app.git.history(app.path, 0)).commits;
    const backup = history.find((commit) => commit.title === 'Preserve discarded Studio edits');
    expect(backup).toBeDefined();
    expect(await app.git.readAt(app.path, backup?.sha ?? '', 'new-scene.html')).toContain('<h1>Scene</h1>');
  });

  it('refuses stale editor discard after a later commit and refreshes the baseline on reopen', async () => {
    await app.api.startStudio(app.scope);
    await writeFile(join(app.path, 'script.md'), '# Later commit');
    await app.git.commit(app.path, 'Later change', 'A legitimate intervening edit.');
    await expect(app.api.discardStudio(app.scope)).rejects.toThrow('committed after opening');
    await app.api.startStudio(app.scope);
    await writeFile(join(app.path, 'script.md'), '# Draft after reopening');
    await app.api.discardStudio(app.scope);
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe('# Later commit');
  });

  it('does not silently commit manual Studio changes in order to render', async () => {
    await writeFile(join(app.path, 'script.md'), '# Unsaved manual edit');
    await expect(app.api.renderVideo(app.scope)).rejects.toThrow('Save pending changes');
    expect(app.media.renderVideo).not.toHaveBeenCalled();
    expect(app.agent.run).not.toHaveBeenCalled();
    expect((await app.git.status(app.path)).dirty).toBe(true);
  });
});
