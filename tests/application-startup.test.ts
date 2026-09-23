import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentError } from '../src/domain/agent';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

describe('uncertain turn recovery', () => {
  it('keeps the lease until termination, then preserves and commits the staged script without a success receipt', async () => {
    let stopped: () => void = () => undefined;
    const termination = new Promise<void>((resolve) => {
      stopped = resolve;
    });
    let entered = false;
    app.agent.run.mockImplementationOnce(async (_input, emit) => {
      emit({ type: 'thread', threadId: 'uncertain-thread' });
      await writeFile(join(app.path, 'partial.txt'), 'Agent work before lost ACK');
      entered = true;
      await termination;
      throw new AgentError('uncertain-start', 'Start unknown; Codex stopped.');
    });
    const submitted = app.api.saveScript({
      scope: app.scope,
      revision: app.workspace.revision,
      content: '# Preserve staged direction',
      guidance: 'Implement this',
      selection: app.request.selection,
    });
    const result = submitted.catch((error: unknown) => error);
    try {
      await vi.waitFor(
        () => {
          expect(entered).toBe(true);
        },
        { timeout: 10_000, interval: 25 },
      );
      expect(app.agent.run).toHaveBeenCalledOnce();
      await expect(app.api.closeChat(app.session.id)).rejects.toThrow('Another operation');
      expect((await app.git.status(app.path)).dirty).toBe(true);
    } finally {
      stopped();
      await result;
    }
    expect(await result).toMatchObject({ code: 'uncertain-start' });
    await app.idle();
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe('# Preserve staged direction');
    expect(await readFile(join(app.path, 'partial.txt'), 'utf8')).toContain('Agent work');
    expect((await app.git.status(app.path)).dirty).toBe(false);
    const session = await app.store.getSession(app.session.id);
    expect(session.threadId).toBe('uncertain-thread');
    expect(session.messages.map((message) => message.role)).toEqual(['user', 'error']);
    expect(session.checkpoints ?? []).toEqual([]);
    expect(app.events.some((event) => event.type === 'chat' && !!event.message.appMessage)).toBe(false);
  });

  it('does not rewrite an earlier verified checkpoint after uncertain later changes', async () => {
    await app.api.sendChat(app.request);
    await app.idle();
    const previous = structuredClone((await app.store.getSession(app.session.id)).checkpoints);
    app.agent.run.mockImplementationOnce(async () => {
      await writeFile(join(app.path, 'later.txt'), 'Preserve later work');
      throw new AgentError('uncertain-start', 'Stopped uncertain later turn');
    });
    await expect(app.api.sendChat(app.request)).rejects.toThrow('uncertain later turn');
    await app.idle();
    expect((await app.store.getSession(app.session.id)).checkpoints).toEqual(previous);
    await expect(app.api.undoChat(app.session.id)).rejects.toThrow('Files changed after this turn');
    expect(await readFile(join(app.path, 'later.txt'), 'utf8')).toBe('Preserve later work');
  });
});
