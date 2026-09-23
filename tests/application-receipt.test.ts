import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunResult } from '../src/domain/agent';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});
const complete: AgentRunResult = {
  threadId: 'receipt-thread',
  turnId: 'receipt-turn',
  status: 'completed',
  error: null,
  output: '',
};

function edit(operation: () => Promise<void>) {
  app.agent.run.mockImplementationOnce(async (_input, emit) => {
    emit({ type: 'thread', threadId: complete.threadId });
    emit({ type: 'turn', turnId: complete.turnId });
    await operation();
    emit({
      type: 'message',
      delta: false,
      message: {
        id: 'agent-final',
        role: 'assistant',
        text: 'My commit was blocked by index.lock.',
        turnId: complete.turnId,
        files: [],
        createdAt: new Date().toISOString(),
      },
    });
    return complete;
  });
}
async function finish() {
  await app.api.sendChat(app.request);
  await app.idle();
  return app.store.getSession(app.session.id);
}
function emittedReceipts() {
  return app.events.filter((event) => event.type === 'chat' && event.message.appMessage);
}

describe('verified application turn receipts', () => {
  it('includes already-committed shell edits and persists a receipt without rewriting agent prose', async () => {
    edit(async () => {
      await writeFile(join(app.path, 'script.md'), '# Directly committed edit\n');
      await app.git.commit(app.path, 'Agent commit', 'A shell-driven edit with no file-change event.');
      await writeFile(join(app.path, 'scene.html'), '<main>Second agent commit</main>\n');
      await app.git.commit(app.path, 'Agent second commit', 'Keep both commits in the receipt.');
    });
    const session = await finish();
    const receipt = session.messages.at(-1);
    expect(receipt?.appMessage).toEqual({ id: 'turnSaved' });
    expect(receipt?.files.map((file) => file.path).sort()).toEqual([
      join(app.path, 'scene.html'),
      join(app.path, 'script.md'),
    ]);
    expect(receipt?.files.find((file) => file.path.endsWith('script.md'))?.diff).toContain(
      '+# Directly committed edit',
    );
    expect(session.messages.find((message) => message.id === 'agent-final')?.text).toBe(
      'My commit was blocked by index.lock.',
    );
    expect(app.agent.run).toHaveBeenCalledOnce();
    expect(emittedReceipts()).toHaveLength(1);
    const reloaded = new LocalStorage(join(app.root, 'settings'), app.git);
    expect((await reloaded.getSession(session.id)).messages.at(-1)).toEqual(receipt);
    expect((await app.api.undoChat(session.id)).messages).toEqual([]);
  });

  it('receipts fallback commits across repositories with unambiguous paths', async () => {
    const repositories = await app.store.repositories(app.scope);
    edit(async () => {
      for (const repository of repositories)
        await writeFile(join(repository, 'same-name.md'), `Changed in ${repository}\n`);
    });
    app.agent.run.mockRejectedValueOnce(new Error('Commit helper quota exhausted'));
    const session = await finish();
    const receipt = session.messages.at(-1);
    expect(receipt?.appMessage).toEqual({ id: 'turnSaved' });
    expect(receipt?.files.map((file) => file.path).sort()).toEqual(
      repositories.map((repository) => join(repository, 'same-name.md')).sort(),
    );
    for (const repository of repositories) {
      expect((await app.git.status(repository)).dirty).toBe(false);
      expect((await app.git.history(repository, 0)).commits[0]?.title).toBe('Save workspace changes');
    }
  });

  it('distinguishes a successful no-change turn without claiming files were saved', async () => {
    const before = await app.git.head(app.path);
    const session = await finish();
    expect(session.messages.at(-1)).toMatchObject({ appMessage: { id: 'turnUnchanged' }, files: [] });
    expect(await app.git.head(app.path)).toBe(before);
    expect(app.events.some((event) => event.type === 'notice' && event.detail === 'Changes saved.')).toBe(
      false,
    );
  });

  it('does not add save receipts to read-only conversations', async () => {
    await app.api.sendChat({ ...app.request, mode: 'read' });
    await app.idle();
    expect((await app.store.getSession(app.session.id)).messages.some((message) => message.appMessage)).toBe(
      false,
    );
    expect(emittedReceipts()).toEqual([]);
  });

  it('reports no net file changes when the agent commits and then reverses its own edit', async () => {
    edit(async () => {
      await writeFile(join(app.path, 'script.md'), '# Temporary idea\n');
      await app.git.commit(app.path, 'Try an idea', 'An intermediate change.');
      await writeFile(join(app.path, 'script.md'), '');
      await app.git.commit(app.path, 'Discard the idea', 'Return to the original content.');
    });
    const session = await finish();
    expect(session.messages.at(-1)).toMatchObject({ appMessage: { id: 'turnUnchanged' }, files: [] });
  });

  it('does not claim success for an interrupted turn even when partial edits are preserved', async () => {
    edit(async () => {
      await writeFile(join(app.path, 'script.md'), '# Partial work\n');
      throw new Error('Agent disconnected');
    });
    const session = await finish();
    expect((await app.git.status(app.path)).dirty).toBe(false);
    expect(session.messages.at(-1)?.text).toContain('Agent disconnected');
    expect(emittedReceipts()).toEqual([]);
    expect(session.messages.some((message) => message.appMessage)).toBe(false);
  });

  it('does not publish a saved receipt when Git cannot preserve the changes', async () => {
    edit(() => writeFile(join(app.path, 'script.md'), '# Unsaved\n'));
    vi.spyOn(app.git, 'commit').mockRejectedValueOnce(new Error('Git index is locked'));
    const session = await finish();
    expect((await app.git.status(app.path)).dirty).toBe(true);
    expect(session.checkpoints?.at(-1)?.postHeads).toBeUndefined();
    expect(emittedReceipts()).toEqual([]);
    expect(
      app.events.some((event) => event.type === 'notice' && event.detail.includes('index is locked')),
    ).toBe(true);
  });

  it('emits the receipt only after its final conversation record is durable', async () => {
    edit(() => writeFile(join(app.path, 'script.md'), '# Saved source\n'));
    const save = app.store.saveSession.bind(app.store);
    vi.spyOn(app.store, 'saveSession').mockImplementation(async (session) => {
      if (session.messages.some((message) => message.appMessage)) throw new Error('History disk failed');
      await save(session);
    });
    const session = await finish();
    expect((await app.git.status(app.path)).dirty).toBe(false);
    expect(session.messages.some((message) => message.appMessage)).toBe(false);
    expect(emittedReceipts()).toEqual([]);
    expect(
      app.events.some((event) => event.type === 'notice' && event.detail.includes('History disk failed')),
    ).toBe(true);
  });

  it('never fabricates a receipt if checkpoint comparison fails', async () => {
    edit(() => writeFile(join(app.path, 'script.md'), '# Real change\n'));
    vi.spyOn(app.git, 'diffBetween').mockRejectedValueOnce(new Error('History cannot be read'));
    const session = await finish();
    expect(session.messages.some((message) => message.appMessage)).toBe(false);
    expect(emittedReceipts()).toEqual([]);
    expect(
      app.events.some((event) => event.type === 'notice' && event.detail.includes('History cannot be read')),
    ).toBe(true);
  });

  it('rejects a stale receipt when files change during comparison', async () => {
    edit(() => writeFile(join(app.path, 'script.md'), '# Saved change\n'));
    const diff = app.git.diffBetween.bind(app.git);
    vi.spyOn(app.git, 'diffBetween').mockImplementationOnce(async (...args) => {
      const files = await diff(...args);
      await writeFile(join(app.path, 'later.md'), 'An external edit\n');
      return files;
    });
    const session = await finish();
    expect((await app.git.status(app.path)).dirty).toBe(true);
    expect(session.messages.some((message) => message.appMessage)).toBe(false);
    expect(emittedReceipts()).toEqual([]);
  });
});
