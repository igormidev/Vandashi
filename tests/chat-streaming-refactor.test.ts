import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatSession } from '../src/domain/models';
import { EventReducer, itemMessage } from '../src/infrastructure/codex/events';
import { readHistory } from '../src/infrastructure/codex/history';
import type { RpcClient } from '../src/infrastructure/codex/transport';
import { sessionSchema } from '../src/infrastructure/storage/schemas';
import {
  chatTimeline,
  currentTimelineTurn,
  liveActivityMessage,
} from '../src/renderer/features/chat/timeline';
import { mergeSession } from '../src/renderer/features/chat/session-state';
import type { AgentEvent } from '../src/domain/agent';

function message(event: AgentEvent | null): ChatMessage {
  if (event?.type !== 'message') throw new Error('Expected message');
  return event.message;
}
function session(messages: ChatMessage[]): ChatSession {
  return {
    id: 'chat',
    scope: { brandId: 'brand', videoId: null, clipId: null },
    topic: 'brand',
    title: 'Brand',
    threadId: 'thread',
    messages,
    open: true,
    updatedAt: '2026-10-07T12:00:00Z',
  };
}
const started = {
  method: 'item/started',
  params: {
    turnId: 'turn',
    item: {
      id: 'command',
      type: 'commandExecution',
      command: 'cat brand_config.yml',
      cwd: '/workspace',
      aggregatedOutput: '',
      status: 'inProgress',
    },
  },
};

describe('Codex work-log streaming', () => {
  it('retains native command identity, output, timing, and failed exit status through deltas and completion', () => {
    const reducer = new EventReducer();
    const initial = message(reducer.reduce(started));
    expect(initial.activity).toMatchObject({
      kind: 'read',
      status: 'inProgress',
      command: 'cat brand_config.yml',
      cwd: '/workspace',
    });
    const delta = message(
      reducer.reduce({
        method: 'item/commandExecution/outputDelta',
        params: { turnId: 'turn', itemId: 'command', delta: 'permission denied\n' },
      }),
    );
    expect(delta.activity?.detail).toBe('permission denied\n');
    expect(delta.activity?.command).toBe(initial.activity?.command);
    const final = message(
      reducer.reduce({
        method: 'item/completed',
        params: {
          turnId: 'turn',
          item: {
            ...started.params.item,
            aggregatedOutput: 'permission denied\n',
            status: 'completed',
            exitCode: 1,
            durationMs: 450,
          },
        },
      }),
    );
    expect(final.streaming).toBe(false);
    expect(final.activity).toMatchObject({
      status: 'failed',
      exitCode: 1,
      durationMs: 450,
      startedAt: initial.createdAt,
    });
    expect(final.activity?.completedAt).toBeTruthy();
  });

  it('keeps independent reasoning lanes and stable index order without duplicating content and summaries', () => {
    const reducer = new EventReducer();
    reducer.reduce({
      method: 'item/started',
      params: { turnId: 'turn', item: { id: 'reason', type: 'reasoning', summary: [] } },
    });
    reducer.reduce({
      method: 'item/reasoning/textDelta',
      params: { turnId: 'turn', itemId: 'reason', contentIndex: 1, delta: 'body two' },
    });
    const body = message(
      reducer.reduce({
        method: 'item/reasoning/textDelta',
        params: { turnId: 'turn', itemId: 'reason', contentIndex: 0, delta: 'body one' },
      }),
    );
    expect(body.text).toBe('body one\n\nbody two');
    reducer.reduce({
      method: 'item/reasoning/summaryTextDelta',
      params: { turnId: 'turn', itemId: 'reason', summaryIndex: 1, delta: 'summary two' },
    });
    const summary = message(
      reducer.reduce({
        method: 'item/reasoning/summaryTextDelta',
        params: { turnId: 'turn', itemId: 'reason', summaryIndex: 0, delta: 'summary one' },
      }),
    );
    expect(summary.text).toBe('summary one\n\nsummary two');
    const moreBody = message(
      reducer.reduce({
        method: 'item/reasoning/textDelta',
        params: { turnId: 'turn', itemId: 'reason', contentIndex: 0, delta: ' hidden continuation' },
      }),
    );
    expect(moreBody.text).toBe(summary.text);
    expect(moreBody.streaming).toBe(true);
  });

  it('settles partial plan and streaming items truthfully on interruption and does not mark a failed tool successful', () => {
    const reducer = new EventReducer();
    reducer.reduce(started);
    reducer.reduce({
      method: 'turn/plan/updated',
      params: {
        turnId: 'turn',
        explanation: 'Prepare the edit',
        plan: [
          { step: 'Read guides', status: 'completed' },
          { step: 'Edit script', status: 'inProgress' },
        ],
      },
    });
    const failures = itemMessage(
      { id: 'failed', type: 'commandExecution', command: 'false', exitCode: 1, status: 'failed' },
      'turn',
    );
    expect(failures?.activity?.status).toBe('failed');
    const settled = reducer.settle('turn', 'interrupted').map(message);
    expect(settled).toHaveLength(2);
    expect(settled.every((item) => item.streaming === false && item.activity?.status === 'interrupted')).toBe(
      true,
    );
    expect(settled.find((item) => item.activity?.kind === 'plan')?.activity?.steps).toEqual([
      { text: 'Read guides', status: 'completed' },
      { text: 'Edit script', status: 'inProgress' },
    ]);
    expect(reducer.settle('turn', 'completed')).toEqual([]);
  });

  it('bounds native tool outputs while preserving a command whose prefix falls outside the retained tail', () => {
    const reducer = new EventReducer();
    reducer.reduce(started);
    const next = message(
      reducer.reduce({
        method: 'item/commandExecution/outputDelta',
        params: { turnId: 'turn', itemId: 'command', delta: 'x'.repeat(70_000) },
      }),
    );
    expect(next.text.length).toBe(64 * 1024);
    expect(next.activity?.detail?.length).toBe(64 * 1024);
    expect(next.activity?.command).toBe('cat brand_config.yml');
  });

  it('keeps subagent prompts, tool errors, and compaction as structured provider activities without artifact grants', () => {
    const agent = itemMessage(
      {
        id: 'agent',
        type: 'collabAgentToolCall',
        tool: 'spawnAgent',
        prompt: 'Inspect the script',
        agentsStates: { child: { status: 'completed' } },
      },
      'turn',
    );
    expect(agent?.activity).toMatchObject({ kind: 'agent', title: 'spawnAgent' });
    expect(agent?.activity?.detail).toContain('Inspect the script');
    expect(agent?.generatedImages).toBeUndefined();
    expect(itemMessage({ id: 'compact', type: 'contextCompaction' }, 'turn')?.activity?.kind).toBe(
      'compaction',
    );
    expect(
      itemMessage(
        { id: 'mcp', type: 'mcpToolCall', server: 'browser', tool: 'read', error: { message: 'Denied' } },
        'turn',
      )?.activity,
    ).toMatchObject({ kind: 'browser', status: 'failed' });
  });

  it('decorates known login-shell read and search commands without interpreting arbitrary quoted shell fragments', () => {
    expect(
      itemMessage({ id: 'read', type: 'commandExecution', command: '/bin/zsh -lc "cat script.md"' }, 'turn')
        ?.activity?.kind,
    ).toBe('read');
    expect(
      itemMessage({ id: 'search', type: 'commandExecution', command: "/bin/bash -lc 'rg title'" }, 'turn')
        ?.activity?.kind,
    ).toBe('search');
    expect(
      itemMessage({ id: 'unknown', type: 'commandExecution', command: 'echo -c "cat script.md"' }, 'turn')
        ?.activity?.kind,
    ).toBe('command');
  });
});

describe('Chat presentation reconciliation', () => {
  it('retains commentary boundaries and turn ownership while leaving queued drafts outside the transcript', () => {
    const one = itemMessage({ id: 'one', type: 'reasoning', summary: ['Read guides'] }, 'a');
    const two = itemMessage({ id: 'two', type: 'commandExecution', command: 'rg title' }, 'a');
    const commentary = itemMessage(
      { id: 'comment', type: 'agentMessage', phase: 'commentary', text: 'I found the guide.' },
      'a',
    );
    const three = itemMessage({ id: 'three', type: 'fileChange', changes: [] }, 'a');
    const four = itemMessage({ id: 'four', type: 'reasoning', summary: ['Different turn'] }, 'b');
    const queued = {
      ...message(new EventReducer().reduce(started)),
      id: 'queued',
      role: 'user' as const,
      pending: 'queued' as const,
    };
    if (!one || !two || !commentary || !three || !four) throw new Error('Missing provider item');
    const timeline = chatTimeline([one, two, queued, commentary, three, four]);
    expect(timeline.map((entry) => entry.kind)).toEqual(['activity', 'message', 'activity', 'activity']);
    expect(timeline[0]).toMatchObject({ messages: [{ id: 'one' }, { id: 'two' }] });
    expect(timeline[1]).toMatchObject({ message: { text: commentary.text, phase: 'commentary' } });
  });

  it('adopts authoritative shorter final text and terminal activity while rejecting stale in-progress metadata', () => {
    const live = message(new EventReducer().reduce(started));
    const final: ChatMessage = {
      ...live,
      text: 'Done',
      streaming: false,
      activity: { kind: 'read', status: 'completed', exitCode: 0 },
    };
    expect(
      mergeSession(session([final]), session([{ ...live, text: 'a much longer partial output' }]))
        .messages[0],
    ).toMatchObject(final);
    expect(mergeSession(session([live]), session([final])).messages[0]).toMatchObject(final);
    const longer: ChatMessage = { ...live, text: `${live.text}new streamed output` };
    expect(mergeSession(session([live]), session([longer])).messages[0]?.text).toBe(longer.text);
  });

  it('persists validated activity for reopen while stripping streaming and optimistic state and preserving raw content', () => {
    const reducer = new EventReducer();
    const live = message(reducer.reduce(started));
    const saved = sessionSchema.parse(session([{ ...live, pending: 'sending', phase: 'commentary' }]));
    expect(saved.messages[0]).not.toHaveProperty('streaming');
    expect(saved.messages[0]).not.toHaveProperty('pending');
    expect(saved.messages[0]?.activity).toMatchObject({ kind: 'read', command: 'cat brand_config.yml' });
    expect(saved.messages[0]?.text).toBe(live.text);
    expect(
      sessionSchema.safeParse(
        session([{ ...live, activity: { ...live.activity, kind: 'unsupported' } } as unknown as ChatMessage]),
      ).success,
    ).toBe(false);
  });

  it('adopts a shorter canonical provider answer after persisted partial text has lost its live flag', async () => {
    const partial = itemMessage(
      {
        id: 'answer',
        type: 'agentMessage',
        text: 'A longer partial answer that was interrupted',
        phase: 'final_answer',
      },
      'turn',
    );
    const client: RpcClient = {
      request: (method) =>
        Promise.resolve(
          method === 'thread/read'
            ? { thread: { id: 'thread' } }
            : {
                data: [
                  {
                    id: 'turn',
                    status: 'completed',
                    items: [
                      { id: 'answer', type: 'agentMessage', text: 'Canonical answer', phase: 'final_answer' },
                    ],
                  },
                ],
                nextCursor: null,
              },
        ),
      subscribe: () => () => undefined,
      onFailure: () => () => undefined,
      close: () => Promise.resolve(),
    };
    const canonical = (await readHistory(client, 'thread')).messages[0];
    if (!partial || !canonical) throw new Error('Missing answer');
    const stored = sessionSchema.parse(session([{ ...partial, streaming: true }]));
    expect(stored.messages[0]).not.toHaveProperty('streaming');
    expect(mergeSession(session([canonical]), stored).messages[0]?.text).toBe('Canonical answer');
  });

  it('does not infer completion from a final-answer lane in an unverified persisted partial cache', () => {
    const partial = itemMessage(
      { id: 'answer', type: 'agentMessage', text: 'Beginning', phase: 'final_answer' },
      'turn',
    );
    if (!partial) throw new Error('Missing answer');
    const cache = sessionSchema.parse(session([{ ...partial, streaming: true }]));
    const live = { ...partial, text: 'Beginning and newly received live text', streaming: true };
    const merged = mergeSession(cache, session([live])).messages[0];
    expect(merged?.text).toBe(live.text);
    expect(merged?.streaming).toBe(true);
  });

  it('keeps a parallel earlier tool live across later completion and commentary without reviving old turns', () => {
    const reducer = new EventReducer();
    const first = message(reducer.reduce(started));
    reducer.reduce({
      method: 'item/started',
      params: { turnId: 'turn', item: { ...started.params.item, id: 'second' } },
    });
    const second = message(
      reducer.reduce({
        method: 'item/completed',
        params: { turnId: 'turn', item: { ...started.params.item, id: 'second', status: 'completed' } },
      }),
    );
    expect(liveActivityMessage([first, second])?.id).toBe(first.id);
    const comment = itemMessage(
      { id: 'comment', type: 'agentMessage', text: 'Waiting for the first tool.', phase: 'commentary' },
      'turn',
    );
    if (!comment) throw new Error('Missing comment');
    expect(currentTimelineTurn([first, second, comment])).toBe(first.turnId);
    const next = { ...comment, id: 'next', turnId: 'new-turn' };
    expect(currentTimelineTurn([first, second, comment, next])).toBe('new-turn');
    expect(currentTimelineTurn([first, { ...next, role: 'user', turnId: null }])).toBeNull();
  });
});
