import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { AgentPort } from '../src/domain/agent';
import type { ChatContextUsage } from '../src/domain/chat-usage';
import type { AppEvent } from '../src/domain/models';
import { ChatUsageService } from '../src/application/chat-usage';
import { OperationGate } from '../src/application/operation-gate';
import { compactContext } from '../src/infrastructure/codex/compaction';
import { accountObservation, contextObservation, CodexUsage } from '../src/infrastructure/codex/usage';
import type { RpcClient, RpcNotification } from '../src/infrastructure/codex/transport';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let fixture: ApplicationFixture | undefined;
afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});
const contextEvent = (threadId = 'native') => ({
  method: 'thread/tokenUsage/updated',
  params: {
    threadId,
    tokenUsage: { last: { totalTokens: 1234 }, total: { totalTokens: 987654 }, modelContextWindow: 100000 },
  },
});
function rpc() {
  const listeners = new Set<(event: RpcNotification) => void>();
  const client = {
    request: vi.fn<RpcClient['request']>(() => Promise.resolve({})),
    subscribe: (listener: (event: RpcNotification) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onFailure: () => () => undefined,
    close: vi.fn<RpcClient['close']>(() => Promise.resolve()),
  } satisfies RpcClient;
  return {
    client,
    notify: (event: RpcNotification) => {
      for (const listener of listeners) listener(event);
    },
  };
}
const limits = {
  rateLimits: {
    limitId: 'codex',
    primary: { usedPercent: 72, windowDurationMins: 300, resetsAt: 1791400000 },
  },
};

it('distinguishes the current context from cumulative processed tokens and rejects corrupt observations', () => {
  const observed = contextObservation(contextEvent());
  expect(observed?.context).toMatchObject({ usedTokens: 1234, totalTokens: 987654, maxTokens: 100000 });
  expect(contextObservation({ ...contextEvent(), method: 'other' })).toBeNull();
  expect(
    contextObservation({
      method: 'thread/tokenUsage/updated',
      params: { threadId: 'native', tokenUsage: { last: { totalTokens: -1 } } },
    }),
  ).toBeNull();
  expect(
    contextObservation({
      method: 'thread/tokenUsage/updated',
      params: { threadId: 'native', tokenUsage: { last: { totalTokens: 0 } } },
    })?.context,
  ).toMatchObject({ usedTokens: 0, maxTokens: null, totalTokens: null });
});

it('selects the ordinary Codex allowance rather than a model-specific bucket and preserves unknown reset/duration', () => {
  const ordinary = {
    limitId: 'codex',
    primary: { usedPercent: 27 },
    secondary: { usedPercent: 110, windowDurationMins: 10080, resetsAt: 1791400000 },
  };
  const value = accountObservation({
    rateLimits: { limitId: 'spark', primary: { usedPercent: 2 } },
    rateLimitsByLimitId: { codex: ordinary },
  });
  expect(value.available).toBe(true);
  expect(value.windows[0]).toEqual({ id: 'primary', usedPercent: 27, durationMinutes: null, resetsAt: null });
  expect(value.windows[1]).toMatchObject({
    usedPercent: 100,
    durationMinutes: 10080,
    resetsAt: new Date(1791400000 * 1000).toISOString(),
  });
  expect(
    accountObservation({ rateLimits: { limitId: 'spark', primary: { usedPercent: 0 } } }).available,
  ).toBe(false);
  expect(accountObservation({ rateLimits: { primary: { usedPercent: NaN } } }).windows).toEqual([]);
});

it('coalesces live reads while accepting newer context and never substitutes old quota after a failed refresh', async () => {
  const { client } = rpc();
  let complete: ((value: unknown) => void) | undefined;
  client.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const changed = vi.fn();
  const usage = new CodexUsage(changed);
  const first = usage.read(client, 'native');
  const second = usage.read(client, 'native');
  usage.observe(contextEvent());
  complete?.(limits);
  expect((await first).context?.usedTokens).toBe(1234);
  expect((await second).account.windows[0]?.usedPercent).toBe(72);
  expect(client.request).toHaveBeenCalledTimes(1);
  client.request.mockRejectedValueOnce(new Error('Offline'));
  expect((await usage.read(client, 'native')).account).toMatchObject({ available: false, windows: [] });
  expect((await usage.read(client, 'different')).context).toBeNull();
  usage.clear();
  expect((await usage.read(client, 'native')).context).toBeNull();
});

it('retains the compaction operation after acknowledgement until its own native turn finishes', async () => {
  const { client, notify } = rpc();
  const events: string[] = [];
  let finished = false;
  const pending = compactContext(
    client,
    'native',
    (event) => {
      if (event.type === 'message') events.push(event.message.activity?.status ?? 'none');
    },
    () => undefined,
  ).then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(client.request).toHaveBeenCalledWith('thread/compact/start', { threadId: 'native' });
  expect(finished).toBe(false);
  notify({ method: 'turn/started', params: { threadId: 'other', turn: { id: 'foreign' } } });
  notify({ method: 'turn/started', params: { threadId: 'native', turn: { id: 'owned' } } });
  notify({
    method: 'item/started',
    params: { threadId: 'native', turnId: 'owned', item: { id: 'compact', type: 'contextCompaction' } },
  });
  notify({
    method: 'turn/completed',
    params: { threadId: 'native', turn: { id: 'foreign', status: 'completed' } },
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  notify({
    method: 'turn/completed',
    params: {
      threadId: 'native',
      turn: { id: 'owned', status: 'completed', items: [{ id: 'compact', type: 'contextCompaction' }] },
    },
  });
  await pending;
  expect(events).toContain('inProgress');
  expect(events.at(-1)).toBe('completed');
  expect(client.close).not.toHaveBeenCalled();
});

it('awaits provider shutdown before a timed-out compact request rejects and releases its caller', async () => {
  const { client, notify } = rpc();
  let stopped: (() => void) | undefined;
  client.close.mockImplementation(
    () =>
      new Promise((resolve) => {
        stopped = resolve;
      }),
  );
  let rejected = false;
  const pending = compactContext(
    client,
    'native',
    () => undefined,
    () => undefined,
    10,
  ).catch(() => {
    rejected = true;
  });
  notify({ method: 'turn/started', params: { threadId: 'native', turn: { id: 'owned' } } });
  await vi.waitFor(() => {
    expect(client.close).toHaveBeenCalledOnce();
  });
  expect(rejected).toBe(false);
  stopped?.();
  await pending;
  expect(rejected).toBe(true);
});

async function usageService(hasQueue: () => boolean = () => false) {
  fixture = await applicationFixture();
  const session = {
    ...fixture.session,
    threadId: 'native',
    checkpoints: [
      { turnId: 'before', mode: 'read' as const, threadId: 'native', heads: {}, messageCount: 0 },
    ],
    messages: [
      {
        id: 'receipt',
        role: 'assistant' as const,
        text: 'Saved changes',
        turnId: null,
        files: [],
        createdAt: new Date().toISOString(),
      },
    ],
  };
  await fixture.store.saveSession(session);
  const compactThread = vi.fn<NonNullable<AgentPort['compactThread']>>(() => Promise.resolve());
  const agent: AgentPort = { ...fixture.agent, compactThread };
  fixture.agent.models.mockResolvedValue([
    {
      id: 'native-model',
      name: 'Native',
      description: '',
      reasoning: ['medium'],
      defaultReasoning: 'medium',
      fast: false,
      isDefault: true,
    },
  ]);
  const events: AppEvent[] = [];
  const gate = new OperationGate();
  const service = new ChatUsageService(fixture.store, fixture.git, agent, gate, hasQueue, (event) => {
    events.push(event);
  });
  return { fixture, session, service, compactThread, gate, events };
}

it('keeps the global lease through provider completion and preserves app receipts without workspace hydration', async () => {
  const { fixture: current, session, service, compactThread, gate } = await usageService();
  let complete: (() => void) | undefined;
  compactThread.mockImplementation((_thread, _options, onEvent) => {
    onEvent({
      type: 'message',
      delta: false,
      message: {
        id: 'compact',
        role: 'tool',
        text: '',
        turnId: 'compact-turn',
        files: [],
        createdAt: new Date().toISOString(),
        activity: { kind: 'compaction', status: 'completed' },
      },
    });
    return new Promise((resolve) => {
      complete = resolve;
    });
  });
  const hydrate = vi.spyOn(current.store, 'openWorkspace');
  const pending = service.compact(session.id);
  await vi.waitFor(() => {
    expect(compactThread).toHaveBeenCalledOnce();
  });
  expect(gate.busy).toBe(true);
  await expect(service.compact(session.id)).rejects.toThrow();
  expect(compactThread.mock.calls[0]?.[1]).toMatchObject({ mode: 'read', writableRoots: [] });
  complete?.();
  await pending;
  expect(gate.busy).toBe(false);
  const saved = await current.store.getSession(session.id);
  expect(saved.threadId).toBe('native');
  expect(saved.messages.map((message) => message.id)).toEqual(['receipt', 'compact']);
  expect(saved.checkpoints).toEqual(session.checkpoints);
  expect(hydrate).not.toHaveBeenCalled();
});

it('rejects pending messages and dirty repositories before requesting compaction', async () => {
  let queued = true;
  const { fixture: current, session, service, compactThread, gate } = await usageService(() => queued);
  await expect(service.compact(session.id)).rejects.toThrow();
  queued = false;
  await writeFile(join(current.path, 'script.md'), 'Manual uncommitted edit');
  await expect(service.compact(session.id)).rejects.toThrow();
  expect(compactThread).not.toHaveBeenCalled();
  expect(gate.busy).toBe(false);
});

it('revalidates conversation ownership before delivering late context after a reset', async () => {
  const { fixture: current, session } = await usageService();
  let listener: ((threadId: string, context: ChatContextUsage) => void) | undefined;
  const events: AppEvent[] = [];
  const agent: AgentPort = {
    ...current.agent,
    subscribeUsage: (observe) => {
      listener = observe;
      return () => undefined;
    },
  };
  const service = new ChatUsageService(
    current.store,
    current.git,
    agent,
    new OperationGate(),
    () => false,
    (event) => {
      events.push(event);
    },
  );
  await service.read(session.id);
  await current.store.saveSession({ ...session, threadId: 'replacement' });
  const reads = vi.spyOn(current.store, 'getSession');
  const context = { usedTokens: 10, maxTokens: 100, totalTokens: 10, observedAt: new Date().toISOString() };
  listener?.('native', context);
  const stale = reads.mock.results.at(-1)?.value as Promise<unknown> | undefined;
  await stale;
  await Promise.resolve();
  expect(events).toEqual([]);
  listener?.('replacement', context);
  const fresh = reads.mock.results.at(-1)?.value as Promise<unknown> | undefined;
  await fresh;
  await Promise.resolve();
  expect(events).toEqual([{ type: 'chat-usage', sessionId: session.id, context }]);
});
