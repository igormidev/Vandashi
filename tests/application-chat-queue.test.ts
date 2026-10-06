import { afterEach, describe, expect, it, vi } from 'vitest';
import { applicationFixture, type ApplicationFixture } from './application-fixture';
import type { AgentRunResult } from '../src/domain/agent';

let fixture: ApplicationFixture | undefined;
afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});
async function controlled() {
  fixture = await applicationFixture();
  const current = fixture;
  const runs: { prompt: string; finish: (status?: 'completed' | 'failed' | 'interrupted') => void }[] = [];
  current.agent.run.mockImplementation((input, event) => {
    if (input.outputSchema)
      return Promise.resolve({
        threadId: 'helper',
        turnId: 'helper',
        status: 'completed',
        error: null,
        output: '{"title":"Save changes","body":"Preserve the current changes."}',
      });
    const id = `turn-${String(runs.length + 1)}`;
    event({ type: 'thread', threadId: 'thread' });
    event({ type: 'turn', turnId: id });
    return new Promise<AgentRunResult>((resolve) => {
      runs.push({
        prompt: input.prompt,
        finish: (status = 'completed') => {
          resolve({
            threadId: 'thread',
            turnId: id,
            status,
            error: status === 'completed' ? null : 'Controlled failure',
            output: '',
          });
        },
      });
    });
  });
  return { ...current, runs };
}
describe('explicit chat queue', () => {
  it('runs follow-ups in order after the preceding turn has persisted and released its lease', async () => {
    const f = await controlled();
    await f.api.sendChat({ ...f.request, clientMessageId: crypto.randomUUID(), text: 'First' });
    await f.api.queueChat({ ...f.request, clientMessageId: crypto.randomUUID(), text: 'Second' });
    await f.api.queueChat({ ...f.request, clientMessageId: crypto.randomUUID(), text: 'Third' });
    expect(f.runs).toHaveLength(1);
    expect(await f.api.queuedChats(f.session.id)).toHaveLength(2);
    f.runs[0]?.finish();
    await vi.waitFor(() => {
      expect(f.runs).toHaveLength(2);
    });
    expect(f.runs[1]?.prompt).toContain('Second');
    expect(
      (await f.store.getSession(f.session.id)).messages.filter((message) => message.text === 'First'),
    ).toHaveLength(1);
    f.runs[1]?.finish();
    await vi.waitFor(() => {
      expect(f.runs).toHaveLength(3);
    });
    expect(f.runs[2]?.prompt).toContain('Third');
    f.runs[2]?.finish();
    await f.idle();
    expect(await f.api.queuedChats(f.session.id)).toEqual([]);
  });
  it('holds queued messages for review after a failure instead of running them automatically', async () => {
    const f = await controlled();
    await f.api.sendChat({ ...f.request, text: 'First' });
    await f.api.queueChat({ ...f.request, clientMessageId: crypto.randomUUID(), text: 'Review this after' });
    f.runs[0]?.finish('failed');
    await vi.waitFor(async () => {
      expect((await f.api.queuedChats(f.session.id))[0]?.failed).toBe(true);
    });
    expect(f.runs).toHaveLength(1);
    const entry = (await f.api.queuedChats(f.session.id))[0];
    if (!entry) throw new Error('Missing retained draft');
    await f.api.removeQueuedChat({ sessionId: f.session.id, id: entry.id });
    expect(await f.api.queuedChats(f.session.id)).toEqual([]);
  });
  it('rejects a competing conversation while the current one owns the global operation', async () => {
    const f = await controlled();
    const other = await f.api.openChat({ scope: f.scope, topic: 'assets', title: 'Assets' });
    await f.api.sendChat(f.request);
    await expect(
      f.api.queueChat({ ...f.request, sessionId: other.id, text: 'Competing edit' }),
    ).rejects.toThrow();
    f.runs[0]?.finish();
    await f.idle();
  });
});
