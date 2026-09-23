import { describe, expect, it } from 'vitest';
import type { AgentRunInput } from '../src/domain/agent';
import { CodexAgent } from '../src/infrastructure/codex/client';
import { windowsNativeCandidates } from '../src/infrastructure/codex/binary';
import { EventReducer } from '../src/infrastructure/codex/events';
import { executeTurn, sandboxPolicy, turnInput } from '../src/infrastructure/codex/execution';
import { readHistory } from '../src/infrastructure/codex/history';
import { JsonLineDecoder } from '../src/infrastructure/codex/transport';
import type { RpcClient, RpcNotification } from '../src/infrastructure/codex/transport';

class FakeClient implements RpcClient {
  readonly calls: { method: string; params: unknown }[] = [];
  readonly listeners = new Set<(event: RpcNotification) => void>();
  readonly failures = new Set<(error: Error) => void>();
  closed = false;
  constructor(readonly handler: (method: string, params: unknown) => unknown = () => ({})) {}
  request(method: string, params: unknown): Promise<unknown> {
    this.calls.push({ method, params });
    return Promise.resolve(this.handler(method, params));
  }
  subscribe(listener: (event: RpcNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onFailure(listener: (error: Error) => void): () => void {
    this.failures.add(listener);
    return () => this.failures.delete(listener);
  }
  close(): void {
    this.closed = true;
    for (const listener of this.failures) listener(new Error('closed'));
  }
  emit(method: string, params: unknown): void {
    for (const listener of this.listeners) listener({ method, params });
  }
}
const input: AgentRunInput = {
  threadId: 'thread-1',
  cwd: '/workspace',
  writableRoots: ['/workspace'],
  mode: 'read',
  selection: { model: 'gpt-test', reasoning: 'medium', fast: false },
  prompt: 'Hello',
  attachments: [],
};
const model = {
  id: 'gpt-test',
  model: 'gpt-test',
  displayName: 'Test',
  description: '',
  supportedReasoningEfforts: [{ reasoningEffort: 'medium' }],
  defaultReasoningEffort: 'medium',
  isDefault: true,
  serviceTiers: [{ id: 'priority', name: 'Fast' }],
  inputModalities: ['text', 'image'],
};

function agentClient(): FakeClient {
  return new FakeClient((method) => {
    if (method === 'model/list') return { data: [model], nextCursor: null };
    if (method === 'thread/start' || method === 'thread/resume')
      return { thread: { id: 'thread-1', historyMode: 'paginated' } };
    if (method === 'turn/start') return { turn: { id: 'turn-1', status: 'inProgress' } };
    return {};
  });
}
async function untilCall(client: FakeClient, method: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (client.calls.some((call) => call.method === method)) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`Missing call ${method}`);
}

describe('Codex protocol framing', () => {
  it('resolves native Windows package layouts without enabling a shell', () => {
    const candidates = windowsNativeCandidates('/npm', 'arm64');
    expect(
      candidates.some((path) =>
        path.replaceAll('\\', '/').includes('codex-win32-arm64/vendor/aarch64-pc-windows-msvc/bin/codex.exe'),
      ),
    ).toBe(true);
    expect(candidates.some((path) => path.endsWith('.cmd'))).toBe(false);
  });
  it('retains split messages and separates multiple events without dropping Unicode', () => {
    const decoder = new JsonLineDecoder();
    expect(decoder.push('{"text":"Olá')).toEqual([]);
    expect(decoder.push(' 日本"}\n\n{"done":true}\n')).toEqual(['{"text":"Olá 日本"}', '{"done":true}']);
  });
  it('bounds incomplete messages instead of growing memory without limit', () => {
    expect(() => new JsonLineDecoder(3).push('abcd')).toThrow('size limit');
  });
});
describe('Codex streaming', () => {
  it('returns the final answer separately from interim commentary for structured callers', () => {
    const reducer = new EventReducer();
    reducer.reduce({
      method: 'item/completed',
      params: {
        turnId: 't',
        item: {
          id: 'progress',
          type: 'agentMessage',
          phase: 'commentary',
          text: 'I will inspect the changes.',
        },
      },
    });
    reducer.reduce({
      method: 'item/completed',
      params: {
        turnId: 't',
        item: {
          id: 'final',
          type: 'agentMessage',
          phase: 'final_answer',
          text: '{"title":"Change","body":"Reason"}',
        },
      },
    });
    expect(reducer.output()).toBe('{"title":"Change","body":"Reason"}');
  });
  it('replaces completed snapshots without duplicating streamed text', () => {
    const reducer = new EventReducer();
    const base = { threadId: 't', turnId: 'turn', itemId: 'a' };
    reducer.reduce({ method: 'item/agentMessage/delta', params: { ...base, delta: 'Hel' } });
    reducer.reduce({ method: 'item/agentMessage/delta', params: { ...base, delta: 'lo' } });
    const final = reducer.reduce({
      method: 'item/completed',
      params: { ...base, item: { id: 'a', type: 'agentMessage', text: 'Hello' } },
    });
    expect(final).toMatchObject({ type: 'message', delta: false, message: { text: 'Hello' } });
    expect(reducer.output()).toBe('Hello');
  });
  it('keeps reasoning summary parts separate and counts file hunks correctly', () => {
    const reducer = new EventReducer();
    reducer.reduce({
      method: 'item/reasoning/summaryTextDelta',
      params: { itemId: 'r', turnId: 't', summaryIndex: 1, delta: 'Second' },
    });
    expect(
      reducer.reduce({
        method: 'item/reasoning/summaryTextDelta',
        params: { itemId: 'r', turnId: 't', summaryIndex: 0, delta: 'First' },
      }),
    ).toMatchObject({ message: { text: 'First\n\nSecond' } });
    expect(
      reducer.reduce({
        method: 'item/completed',
        params: {
          turnId: 't',
          item: {
            id: 'f',
            type: 'fileChange',
            changes: [{ path: 'a.md', diff: '--- a\n+++ b\n-old\n+new\n+extra' }],
          },
        },
      }),
    ).toMatchObject({ message: { files: [{ additions: 2, deletions: 1 }] } });
  });
  it('waits for turn/completed instead of resolving at turn/start ACK', async () => {
    const client = agentClient();
    let done = false;
    const promise = executeTurn(client, 'thread-1', input, {
      onEvent: () => undefined,
      onTurn: () => undefined,
      supportsImages: true,
    });
    void promise.then(() => {
      done = true;
    });
    await untilCall(client, 'turn/start');
    await Promise.resolve();
    expect(done).toBe(false);
    client.emit('item/agentMessage/delta', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'a',
      delta: 'Ready',
    });
    client.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } });
    await expect(promise).resolves.toMatchObject({ output: 'Ready', status: 'completed' });
    expect(client.listeners.size).toBe(0);
  });
  it('handles a completion arriving before the start response', async () => {
    const client = new FakeClient(() => {
      client.emit('turn/completed', {
        threadId: 'thread-1',
        turn: { id: 'early', status: 'failed', error: { message: 'Usage limit' } },
      });
      return { turn: { id: 'early', status: 'inProgress' } };
    });
    await expect(
      executeTurn(client, 'thread-1', input, {
        onEvent: () => undefined,
        onTurn: () => undefined,
        supportsImages: true,
      }),
    ).resolves.toMatchObject({ status: 'failed', error: 'Usage limit' });
  });
  it('rejects on process failure and releases listeners', async () => {
    const client = agentClient();
    const promise = executeTurn(client, 'thread-1', input, {
      onEvent: () => undefined,
      onTurn: () => undefined,
      supportsImages: true,
    });
    await untilCall(client, 'turn/start');
    client.close();
    await expect(promise).rejects.toThrow('closed');
    expect(client.listeners.size).toBe(0);
  });
});
describe('Codex policy and history', () => {
  it('enforces readonly and scopes writable roots explicitly', () => {
    expect(sandboxPolicy(input)).toEqual({ type: 'readOnly', networkAccess: true });
    expect(sandboxPolicy({ ...input, mode: 'edit' })).toMatchObject({
      type: 'workspaceWrite',
      writableRoots: ['/workspace'],
    });
    expect(turnInput({ ...input, attachments: ['/tmp/photo.png', '/tmp/voice.mp3'] }, true)).toHaveLength(2);
    expect(turnInput({ ...input, attachments: ['/tmp/photo.png'] }, false)).toHaveLength(1);
  });
  it('rejects repeated pagination cursors instead of hanging', async () => {
    const client = new FakeClient((method) =>
      method === 'thread/read' ? { thread: { id: 't' } } : { data: [], nextCursor: 'same' },
    );
    await expect(readHistory(client, 't')).rejects.toThrow('repeated a cursor');
  });
  it('prevents concurrent inference, and unlocks after interruption', async () => {
    const client = agentClient();
    const agent = new CodexAgent({ transportFactory: () => Promise.resolve({ client, version: 'test' }) });
    const first = agent.run(input, () => undefined);
    await untilCall(client, 'turn/start');
    await expect(agent.run(input, () => undefined)).rejects.toMatchObject({ code: 'busy' });
    await agent.stop();
    expect(client.calls.some((call) => call.method === 'turn/interrupt')).toBe(true);
    client.emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'interrupted' } });
    await expect(first).resolves.toMatchObject({ status: 'interrupted' });
    agent.dispose();
  });
  it('sends a boundary ID when forking; never changes local files', async () => {
    const client = new FakeClient((method) =>
      method === 'thread/turns/list' ? { data: [], nextCursor: null } : { thread: { id: 'forked' } },
    );
    const agent = new CodexAgent({ transportFactory: () => Promise.resolve({ client, version: 'test' }) });
    await expect(agent.forkBefore('original', 'before-turn')).resolves.toMatchObject({
      id: 'forked',
      turnIds: [],
    });
    expect(client.calls[0]).toEqual({
      method: 'thread/fork',
      params: { threadId: 'original', beforeTurnId: 'before-turn', excludeTurns: true },
    });
    agent.dispose();
  });
});
