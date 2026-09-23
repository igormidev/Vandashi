import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunResult } from '../src/domain/agent';
import { OperationGate } from '../src/application/operation-gate';
import { parseAgentJson } from '../src/application/agent-json';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

describe('application operation transactions', () => {
  it('keeps one lease even with an empty owner or broken observer and releases after failure', async () => {
    const gate = new OperationGate(() => {
      throw new Error('Window closed');
    });
    const release = gate.acquire('');
    expect(gate.busy).toBe(true);
    expect(() => gate.acquire('other')).toThrow('Another operation');
    release();
    release();
    await expect(gate.run('failure', () => Promise.reject(new Error('failed')))).rejects.toThrow('failed');
    expect(gate.busy).toBe(false);
  });

  it('rejects before staging if Codex preflight fails', async () => {
    vi.mocked(app.agent.capabilities).mockRejectedValueOnce(new Error('Codex unavailable'));
    const before = await readFile(join(app.path, 'script.md'), 'utf8');
    await expect(
      app.api.saveScript({
        scope: app.scope,
        revision: app.workspace.revision,
        content: '# New script',
        guidance: '',
        selection: app.request.selection,
      }),
    ).rejects.toThrow('unavailable');
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe(before);
    expect((await app.git.status(app.path)).dirty).toBe(false);
  });

  it('rolls back only the staged script when the agent fails before accepting a turn', async () => {
    const before = await readFile(join(app.path, 'script.md'), 'utf8');
    const head = await app.git.head(app.path);
    vi.mocked(app.agent.run).mockImplementationOnce(async () => {
      await writeFile(join(app.path, 'external.txt'), 'Keep me');
      throw new Error('Start failed');
    });
    await expect(
      app.api.saveScript({
        scope: app.scope,
        revision: app.workspace.revision,
        content: '# New script',
        guidance: '',
        selection: app.request.selection,
      }),
    ).rejects.toThrow('Start failed');
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe(before);
    expect(await readFile(join(app.path, 'external.txt'), 'utf8')).toBe('Keep me');
    expect(await app.git.head(app.path)).toBe(head);
    expect((await app.store.getSession(app.session.id)).messages).toEqual([]);
  });

  it('restores the original script if Git staging fails after the file write', async () => {
    const before = await readFile(join(app.path, 'script.md'), 'utf8');
    vi.spyOn(app.git, 'stage').mockRejectedValueOnce(new Error('Git index locked'));
    await expect(
      app.api.saveScript({
        scope: app.scope,
        revision: app.workspace.revision,
        content: '# New script',
        guidance: '',
        selection: app.request.selection,
      }),
    ).rejects.toThrow('index locked');
    expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe(before);
    expect((await app.git.status(app.path)).dirty).toBe(false);
    expect(app.agent.run).not.toHaveBeenCalled();
  });

  it('holds the global lease after acceptance through cancellation and final reconciliation', async () => {
    let finish: (result: AgentRunResult) => void = () => {
      throw new Error('Turn not running');
    };
    vi.mocked(app.agent.run).mockImplementationOnce(async (_input, event) => {
      event({ type: 'thread', threadId: 'accepted' });
      event({ type: 'turn', turnId: 'accepted-turn' });
      return new Promise<AgentRunResult>((resolve) => {
        finish = resolve;
      });
    });
    await app.api.sendChat(app.request);
    const settings = (await app.store.getState()).settings;
    await app.api.settings({ ...settings, splits: { creation: 45 } });
    expect((await app.store.getState()).settings.splits['creation']).toBe(45);
    await expect(app.api.describeAsset({ scope: app.scope, path: '/asset.png' })).rejects.toThrow(
      'Another operation',
    );
    await expect(app.api.checks({ scope: app.scope, video: true })).rejects.toThrow('Another operation');
    await expect(app.api.closeChat(app.session.id)).rejects.toThrow('Another operation');
    await expect(app.api.openWorkspace(app.scope)).resolves.toMatchObject({ scope: app.scope });
    await app.api.cancelChat();
    expect(app.agent.stop).toHaveBeenCalledOnce();
    finish({
      threadId: 'accepted',
      turnId: 'accepted-turn',
      status: 'interrupted',
      error: 'Stopped',
      output: '',
    });
    await app.idle();
    expect((await app.store.getSession(app.session.id)).checkpoints?.[0]?.postHeads?.[app.path]).toBe(
      await app.git.head(app.path),
    );
  });

  it('commits interrupted edits deterministically when the commit helper fails', async () => {
    vi.mocked(app.agent.run).mockImplementation(async (input, event) => {
      if (input.outputSchema) throw new Error('Credits exhausted');
      event({ type: 'thread', threadId: 'thread' });
      event({ type: 'turn', turnId: 'turn' });
      await writeFile(join(app.path, 'script.md'), '# Partial meaningful work');
      throw new Error('Disconnected');
    });
    await app.api.sendChat(app.request);
    await app.idle();
    expect((await app.git.status(app.path)).dirty).toBe(false);
    expect((await app.git.history(app.path, 0)).commits[0]?.title).toBe('Save workspace changes');
    const session = await app.store.getSession(app.session.id);
    expect(session.checkpoints?.[0]?.postHeads?.[app.path]).toBe(await app.git.head(app.path));
    expect(session.messages.at(-1)?.text).toContain('Disconnected');
  });

  it('does not implicitly commit periodic workspace reads', async () => {
    const head = await app.git.head(app.path);
    await writeFile(join(app.path, 'script.md'), '# Manual edit');
    await app.api.openWorkspace(app.scope);
    await app.api.openWorkspace(app.scope);
    expect(await app.git.head(app.path)).toBe(head);
    expect((await app.git.status(app.path)).dirty).toBe(true);
    expect(app.agent.run).not.toHaveBeenCalled();
  });

  it('returns the stable workspace during an active edit without repairing half-written YAML', async () => {
    const packaging = join(app.path, 'video_packaging.yml');
    const original = await readFile(packaging, 'utf8');
    let finish: (result: AgentRunResult) => void = () => {
      throw new Error('Turn not running');
    };
    vi.mocked(app.agent.run).mockImplementationOnce((_input, event) => {
      event({ type: 'thread', threadId: 'thread' });
      event({ type: 'turn', turnId: 'editing' });
      return new Promise<AgentRunResult>((resolve) => {
        finish = resolve;
      });
    });
    await app.api.sendChat(app.request);
    await writeFile(packaging, 'temporarily: [');
    expect((await app.api.openWorkspace(app.scope)).video?.packaging).toEqual(app.workspace.video?.packaging);
    expect(await readFile(packaging, 'utf8')).toBe('temporarily: [');
    await writeFile(packaging, original);
    finish({ threadId: 'thread', turnId: 'editing', status: 'completed', error: null, output: '' });
    await app.idle();
    expect(app.events.at(-1)?.type).toBe('workspace-changed');
    const activities = app.events.filter((event) => event.type === 'activity');
    expect(activities.at(-1)?.activity.sessionId).toBe(app.session.id);
  });

  it('accepts a single JSON fence but rejects ambiguous malformed helper output', () => {
    expect(parseAgentJson('```json\n{"title":"Real change","body":"Details"}\n```')).toEqual({
      title: 'Real change',
      body: 'Details',
    });
    expect(() => parseAgentJson('Here is one: {"title":"guess"} and {"title":"other"}')).toThrow(
      'invalid JSON',
    );
  });
});
