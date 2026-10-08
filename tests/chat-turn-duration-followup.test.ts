import { describe, expect, it } from 'vitest';
import type { AgentEvent, AgentPort, AgentRunInput, AgentThread } from '../src/domain/agent';
import type { ChatMessage, ChatSession } from '../src/domain/models';
import type { StoragePort } from '../src/domain/storage';
import { mergeThreadHistory } from '../src/application/chat-history';
import { forkMessage } from '../src/application/chat-history-actions';
import { EventReducer } from '../src/infrastructure/codex/events';
import { executeTurn } from '../src/infrastructure/codex/execution';
import { readHistory } from '../src/infrastructure/codex/history';
import { turnSchema } from '../src/infrastructure/codex/schemas';
import { verifiedTurnDuration } from '../src/infrastructure/codex/turn-timing';
import { sessionSchema } from '../src/infrastructure/storage/schemas';
import { applyMessage, mergeSession } from '../src/renderer/features/chat/session-state';
import { normalizeTurnDurations } from '../src/domain/chat-turn-timing';
import { item, message, messages, session, TimingClient } from './chat-turn-duration-followup-fixture';

describe('verified native turn duration', () => {
  it('accepts native zero and milliseconds without inferring from Unix timestamps or malformed timing', () => {
    expect(
      verifiedTurnDuration('completed', turnSchema.parse({ id: 'turn', durationMs: 0 }).durationMs),
    ).toBe(0);
    const native = turnSchema.parse({
      id: 'turn',
      status: 'completed',
      durationMs: 1234,
      startedAt: 1,
      completedAt: 99,
    });
    expect(verifiedTurnDuration(native.status, native.durationMs)).toBe(1234);
    for (const value of [undefined, null, -1, NaN, Infinity, '1234', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const parsed = turnSchema.parse({ id: 'turn', status: 'completed', durationMs: value });
      expect(verifiedTurnDuration(parsed.status, parsed.durationMs)).toBeUndefined();
    }
    expect(
      verifiedTurnDuration(
        'completed',
        turnSchema.parse({ id: 'turn', startedAt: 1, completedAt: 99 }).durationMs,
      ),
    ).toBeUndefined();
  });

  it('waits for turn settlement and labels only the last answer, excluding commentary and tool timing', () => {
    const reducer = new EventReducer();
    item(reducer, 'first', 'agentMessage', { phase: 'final_answer' });
    item(reducer, 'last', 'agentMessage', { phase: 'final_answer' });
    item(reducer, 'commentary', 'agentMessage', { phase: 'commentary' });
    item(reducer, 'tool', 'commandExecution', { durationMs: 60000, command: 'pwd', status: 'completed' });
    expect(reducer.settle('turn', 'completed')).toEqual([]);
    const settled = messages(reducer.settle('turn', 'completed', 1234));
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({ id: 'last', turnId: 'turn', streaming: false, turnDurationMs: 1234 });
    expect(reducer.settle('another-turn', 'completed', 9999)).toEqual([]);
    const replay = reducer.reduce({
      method: 'item/completed',
      params: { turnId: 'turn', item: { id: 'last', type: 'agentMessage', text: 'last' } },
    });
    expect(replay?.type === 'message' && replay.message.turnDurationMs).toBe(1234);
  });

  it('times a proposed plan after observed success but never a failed or interrupted partial plan', () => {
    for (const status of ['failed', 'interrupted'] as const) {
      const reducer = new EventReducer();
      reducer.reduce({
        method: 'item/plan/delta',
        params: { turnId: 'turn', itemId: 'plan', delta: 'Partial plan' },
      });
      expect(messages(reducer.settle('turn', status, 1234))[0]).not.toHaveProperty('turnDurationMs');
    }
    const reducer = new EventReducer();
    item(reducer, 'commentary', 'agentMessage', { phase: 'commentary' });
    item(reducer, 'plan', 'plan');
    expect(messages(reducer.settle('turn', 'completed', 0))[0]).toMatchObject({
      id: 'plan',
      proposedPlan: true,
      turnDurationMs: 0,
    });
  });

  it('propagates an early completed notification through execution even when items were already complete', async () => {
    const events: AgentEvent[] = [];
    const client = new TimingClient(() => {
      client.emit('item/completed', {
        threadId: 'thread',
        turnId: 'turn',
        item: { id: 'answer', type: 'agentMessage', text: 'Done', phase: 'final_answer' },
      });
      client.emit('turn/completed', {
        threadId: 'thread',
        turn: { id: 'turn', status: 'completed', durationMs: 9876, items: [] },
      });
      return { turn: { id: 'turn', status: 'inProgress' } };
    });
    const input: AgentRunInput = {
      threadId: 'thread',
      cwd: '/workspace',
      mode: 'read',
      writableRoots: [],
      selection: { model: 'test', reasoning: 'medium', fast: false },
      prompt: 'Question',
      attachments: [],
    };
    expect(
      (
        await executeTurn(client, 'thread', input, {
          supportsImages: false,
          onTurn: () => undefined,
          onEvent: (event) => events.push(event),
        })
      ).status,
    ).toBe('completed');
    expect(messages(events).at(-1)).toMatchObject({ id: 'answer', streaming: false, turnDurationMs: 9876 });
    expect(client.listeners.size).toBe(0);
  });

  it('hydrates paginated native timing only for settled answer or plan, preserving unknown and active turns', async () => {
    const client = new TimingClient((method, params) => {
      if (method === 'thread/read') return { thread: { id: 'thread' } };
      const next = (params as { cursor: string | null }).cursor;
      return next
        ? {
            data: [
              {
                id: 'plan-turn',
                status: 'completed',
                durationMs: 0,
                items: [{ id: 'plan', type: 'plan', text: 'Native plan' }],
              },
              {
                id: 'active',
                status: 'inProgress',
                durationMs: 9876,
                items: [{ id: 'partial', type: 'agentMessage', text: 'Partial' }],
              },
              {
                id: 'unknown',
                items: [{ id: 'old', type: 'agentMessage', text: 'Old' }],
                startedAt: 1,
                completedAt: 99,
              },
            ],
            nextCursor: null,
          }
        : {
            data: [
              {
                id: 'turn',
                status: 'completed',
                durationMs: 1234,
                items: [
                  { id: 'answer', type: 'agentMessage', text: 'Answer', phase: 'final_answer' },
                  { id: 'commentary', type: 'agentMessage', text: 'Commentary', phase: 'commentary' },
                  {
                    id: 'tool',
                    type: 'commandExecution',
                    command: 'pwd',
                    status: 'completed',
                    durationMs: 60000,
                  },
                ],
              },
            ],
            nextCursor: 'next',
          };
    });
    const history = await readHistory(client, 'thread');
    expect(
      history.messages
        .filter((entry) => entry.turnDurationMs !== undefined)
        .map((entry) => [entry.id, entry.turnDurationMs]),
    ).toEqual([
      ['answer', 1234],
      ['plan', 0],
    ]);
    expect(history.messages.find((entry) => entry.id === 'partial')).toMatchObject({ streaming: true });
    expect(history.messages.find((entry) => entry.id === 'old')).not.toHaveProperty('streaming');
  });

  it('retains verified timing for identical native turns and adopts fresh zero without cross-turn leakage', () => {
    const cached = session([message('answer', 'turn', { turnDurationMs: 1234 })]);
    const provider = (entry: ChatMessage): AgentThread => ({
      id: 'thread',
      turnIds: [entry.turnId ?? ''],
      messages: [entry],
    });
    expect(mergeThreadHistory(cached, provider(message('answer'))).messages[0]?.turnDurationMs).toBe(1234);
    expect(
      mergeThreadHistory(cached, provider(message('answer', 'turn', { turnDurationMs: 0 }))).messages[0]
        ?.turnDurationMs,
    ).toBe(0);
    expect(
      mergeThreadHistory(cached, provider(message('answer', 'different-turn'))).messages[0],
    ).not.toHaveProperty('turnDurationMs');
  });

  it('preserves timing through cached snapshots but does not infer it from live flags or leak reused IDs', () => {
    const settled = session([message('answer', 'turn', { streaming: false, turnDurationMs: 1234 })]);
    const cache = sessionSchema.parse(session([message('answer', 'turn', { streaming: false })]));
    expect(mergeSession(cache, settled).messages[0]?.turnDurationMs).toBe(1234);
    expect(
      mergeSession(session([message('answer', 'other-turn', { streaming: true })]), settled).messages[0],
    ).not.toHaveProperty('turnDurationMs');
    expect(
      mergeSession(cache, session([message('answer', 'turn', { streaming: true })])).messages[0],
    ).not.toHaveProperty('turnDurationMs');
  });

  it('persists verified duration while stripping transient streaming and rejects nonfinite or negative values', () => {
    const cached = sessionSchema.parse(
      session([message('answer', 'turn', { streaming: false, turnDurationMs: 0 })]),
    );
    expect(cached.messages[0]?.turnDurationMs).toBe(0);
    expect(cached.messages[0]).not.toHaveProperty('streaming');
    expect(sessionSchema.parse(session([message('old')])).messages[0]).not.toHaveProperty('turnDurationMs');
    for (const turnDurationMs of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(sessionSchema.safeParse(session([message('answer', 'turn', { turnDurationMs })])).success).toBe(
        false,
      );
  });

  it('retains the branched turn timing when the provider omits it and removes later turn timings', async () => {
    const current = session([
      message('user-one', 'turn', { role: 'user' }),
      message('answer', 'turn', { turnDurationMs: 1234 }),
      message('user-two', 'next', { role: 'user' }),
      message('later', 'next', { turnDurationMs: 9876 }),
    ]);
    let saved: ChatSession | undefined;
    const store = {
      getSession: () => Promise.resolve(current),
      saveSession: (value: ChatSession) => {
        saved = value;
        return Promise.resolve();
      },
    } as unknown as StoragePort;
    const agent = {
      forkThrough: () =>
        Promise.resolve({ id: 'branch-thread', turnIds: ['turn'], messages: [message('answer')] }),
    } as unknown as AgentPort;
    const branch = await forkMessage(store, agent, { sessionId: 'session', messageId: 'answer' });
    expect(saved).toBe(branch);
    expect(branch.messages.map((entry) => entry.id)).toEqual(['user-one', 'answer']);
    expect(branch.messages.at(-1)?.turnDurationMs).toBe(1234);
    expect(branch.threadId).toBe('branch-thread');
    expect(branch.checkpoints).toEqual([]);
  });
});

describe('single native duration ownership followup', () => {
  const timed = (entries: ChatMessage[]) =>
    entries
      .filter((entry) => entry.turnDurationMs !== undefined)
      .map((entry) => [entry.id, entry.turnDurationMs]);
  const provider = (entries: ChatMessage[]): AgentThread => ({
    id: 'thread',
    turnIds: ['turn'],
    messages: entries,
  });

  it('single duration owner moves to the fresh final native answer in application history and retains other turns', () => {
    const current = session([
      message('first', 'turn', { turnDurationMs: 1234 }),
      message('second', 'turn'),
      message('stale-third', 'turn', { turnDurationMs: 2222 }),
      message('unrelated', 'other-turn', { turnDurationMs: 7890 }),
    ]);
    for (const duration of [0, 4567]) {
      const fresh = provider([
        message('first', 'turn'),
        message('second', 'turn', { turnDurationMs: duration }),
      ]);
      expect(timed(mergeThreadHistory(current, fresh).messages)).toEqual([
        ['second', duration],
        ['unrelated', 7890],
      ]);
      expect(current.messages[0]?.turnDurationMs).toBe(1234);
    }
  });

  it('single duration owner keeps cached evidence only when the fresh exact turn omits timing', () => {
    const current = session([message('first', 'turn', { turnDurationMs: 1234 }), message('second', 'turn')]);
    expect(
      timed(mergeThreadHistory(current, provider([message('first'), message('second')])).messages),
    ).toEqual([['first', 1234]]);
    const reused = session([message('first', 'turn', { turnDurationMs: 1234 })]);
    expect(
      timed(mergeThreadHistory(reused, provider([message('first', 'different-turn')])).messages),
    ).toEqual([]);
  });

  it('single duration owner adopts fresh zero on session hydration and row events without duplicate headers', () => {
    const current = session([
      message('first', 'turn', { streaming: false, turnDurationMs: 1234 }),
      message('second', 'turn'),
    ]);
    const fresh = session([
      message('first', 'turn', { streaming: false }),
      message('second', 'turn', { streaming: false, turnDurationMs: 0 }),
    ]);
    expect(timed(mergeSession(fresh, current).messages)).toEqual([['second', 0]]);
    expect(timed(mergeSession(session([message('first'), message('second')]), current).messages)).toEqual([
      ['first', 1234],
    ]);
    const event = {
      type: 'chat' as const,
      sessionId: 'session',
      delta: false,
      message: message('second', 'turn', { streaming: false, turnDurationMs: 0 }),
    };
    expect(timed(applyMessage(current.messages, event))).toEqual([['second', 0]]);
    expect(current.messages[0]?.turnDurationMs).toBe(1234);
  });

  it('single duration owner is cleared on earlier native items when a later answer settles or an item ID is reused', () => {
    const reducer = new EventReducer();
    item(reducer, 'first', 'agentMessage', { phase: 'final_answer' });
    expect(timed(messages(reducer.settle('turn', 'completed', 1234)))).toEqual([['first', 1234]]);
    item(reducer, 'second', 'agentMessage', { phase: 'final_answer' });
    const settled = messages(reducer.settle('turn', 'completed', 0));
    expect(settled.map((entry) => entry.id)).toEqual(['first', 'second']);
    expect(settled[0]).not.toHaveProperty('turnDurationMs');
    expect(timed(settled)).toEqual([['second', 0]]);
    const replay = reducer.reduce({
      method: 'item/completed',
      params: {
        turnId: 'turn',
        item: { id: 'first', type: 'agentMessage', text: 'First', phase: 'final_answer' },
      },
    });
    expect(replay?.type === 'message' && replay.message).not.toHaveProperty('turnDurationMs');
    const reused = reducer.reduce({
      method: 'item/agentMessage/delta',
      params: { turnId: 'different-turn', itemId: 'second', delta: 'New turn partial' },
    });
    expect(reused?.type === 'message' && reused.message).not.toHaveProperty('turnDurationMs');
  });

  it('single duration owner never moves onto commentary, tool or application receipt content', () => {
    const entries = [
      message('first', 'turn', { turnDurationMs: 1234 }),
      message('plan', 'turn', { proposedPlan: true }),
      message('commentary', 'turn', { phase: 'commentary', turnDurationMs: 111 }),
      message('tool', 'turn', { role: 'tool', turnDurationMs: 222 }),
      message('receipt', 'turn', {
        appMessage: { id: 'clipHandoff', params: { ratio: '9:16', start: 0, end: 5 } },
        turnDurationMs: 333,
      }),
    ];
    expect(timed(normalizeTurnDurations(entries))).toEqual([['first', 1234]]);
    expect(entries[0]?.turnDurationMs).toBe(1234);
  });
  it('single duration owner never grants an active partial cached timing after persistence strips live flags', () => {
    const current = [
      message('first', 'turn', { turnDurationMs: 1234 }),
      message('partial', 'turn', { streaming: true }),
    ];
    const normalized = normalizeTurnDurations(current);
    expect(timed(normalized)).toEqual([['first', 1234]]);
    const cache = sessionSchema.parse(session(normalized));
    expect(cache.messages[1]).not.toHaveProperty('turnDurationMs');
    expect(timed(mergeSession(cache).messages)).toEqual([['first', 1234]]);
    const providerPartial = session([message('first'), message('partial', 'turn', { streaming: true })]);
    expect(timed(mergeSession(providerPartial, session(current)).messages)).toEqual([['first', 1234]]);
  });
});
