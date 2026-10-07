import { describe, expect, it } from 'vitest';
import { diagramPromise, diagramSourceSafe } from '../src/renderer/features/chat/mermaid-rendering';
import { highlightCode } from '../src/renderer/features/chat/syntax-highlighting';
import { EventReducer, itemMessage } from '../src/infrastructure/codex/events';
import { mergeThreadHistory } from '../src/application/chat-history';
import { sessionSchema } from '../src/infrastructure/storage/schemas';
import { agentStatesByTurn, isLiveActivity } from '../src/renderer/features/chat/timeline';

describe('Untrusted chat Markdown', () => {
  it('rejects resource-bearing Mermaid constructs before temporary layout while allowing ordinary diagram labels', () => {
    expect(
      diagramSourceSafe('flowchart TD\n A[Read guides] --> B[Edit script]\n click A "https://example.com/"'),
    ).toBe(true);
    for (const source of [
      'flowchart TD\n A@{ img: "https://example.com/tracker.png" }',
      'flowchart TD\n A["<img src=https://example.com/a.png>"]',
      'flowchart TD\n classDef node fill:url(https://example.com/a.svg);',
      'flowchart TD\n classDef node fill:url("data:image/svg+xml,a");',
      'flowchart TD\n classDef node fill:u\\72l(https://example.com/a.svg);',
      '@import "https://example.com/style.css";',
      'x'.repeat(64 * 1024 + 1),
    ])
      expect(diagramSourceSafe(source)).toBe(false);
  });

  it('coalesces pending diagram work even when many mounted diagrams exceed the settled cache limit', async () => {
    const source = '@import "first-pending-diagram";';
    const first = diagramPromise(source);
    const others = Array.from({ length: 40 }, (_, index) => diagramPromise(`@import "${String(index)}";`));
    expect(diagramPromise(source)).toBe(first);
    expect(await first).toBeNull();
    await Promise.all(others);
  });

  it('highlights local code into safe colored text tokens and preserves literal markup rather than emitting HTML', async () => {
    const source = 'const markup = "<img src=x onerror=evil()>";\n';
    const tokens = await highlightCode(source, 'typescript');
    expect(tokens).not.toBeNull();
    expect(tokens?.map((line) => line.map((token) => token.text).join('')).join('\n')).toBe(source);
    expect(tokens?.flat().some((token) => token.color)).toBe(true);
    expect(await highlightCode(source, 'unknown-future-language')).toBeNull();
    expect(await highlightCode('x'.repeat(64 * 1024 + 1), 'typescript')).toBeNull();
  });

  it('keeps actual proposed plans separate from checklist progress through delta, completion, and hydration conversion', () => {
    const reducer = new EventReducer();
    const streamed = reducer.reduce({
      method: 'item/plan/delta',
      params: { turnId: 'turn', itemId: 'proposal', delta: '# Proposed plan\n' },
    });
    expect(streamed).toMatchObject({
      type: 'message',
      message: { proposedPlan: true, streaming: true, text: '# Proposed plan\n' },
    });
    const complete = reducer.reduce({
      method: 'item/completed',
      params: {
        turnId: 'turn',
        item: { id: 'proposal', type: 'plan', text: '# Proposed plan\n\nRead brand guides.' },
      },
    });
    expect(complete).toMatchObject({ type: 'message', message: { proposedPlan: true, streaming: false } });
    const checklist = reducer.reduce({
      method: 'turn/plan/updated',
      params: { turnId: 'turn', plan: [{ step: 'Read brand guides', status: 'completed' }] },
    });
    expect(checklist).toMatchObject({
      type: 'message',
      message: { role: 'tool', activity: { kind: 'plan' } },
    });
    if (checklist?.type === 'message') expect(checklist.message.proposedPlan).toBeUndefined();
    expect(itemMessage({ id: 'proposal', type: 'plan', text: '# Recovered plan' }, 'turn')).toMatchObject({
      proposedPlan: true,
      streaming: false,
    });
  });

  it('retains actual subagent states/results, independent child lifecycle, and browser identity without changing grants', () => {
    const activity = itemMessage(
      {
        id: 'agents',
        type: 'collabAgentToolCall',
        tool: 'spawnAgent',
        receiverThreadIds: ['child', 'waiting'],
        agentsStates: { child: { status: 'running', message: null } },
      },
      'turn',
    )?.activity;
    expect(activity?.agents).toEqual([
      { id: 'child', name: 'child', status: 'inProgress', result: '' },
      { id: 'waiting', name: 'waiting', status: 'pending', result: '' },
    ]);
    const completed = itemMessage(
      {
        id: 'agents',
        type: 'collabAgentToolCall',
        tool: 'wait',
        agentsStates: { child: { status: 'completed', message: 'The script is valid.' } },
      },
      'turn',
    );
    expect(completed?.activity?.agents?.[0]).toMatchObject({
      status: 'completed',
      result: 'The script is valid.',
    });
    expect(
      itemMessage(
        {
          id: 'child-event',
          type: 'subAgentActivity',
          kind: 'started',
          agentPath: '/root/reviewer',
          agentThreadId: 'child',
        },
        'turn',
      )?.activity,
    ).toMatchObject({ kind: 'agent', status: 'inProgress', title: '/root/reviewer' });
    expect(
      itemMessage(
        { id: 'child-interaction', type: 'subAgentActivity', kind: 'interacted', agentThreadId: 'child' },
        'turn',
      )?.activity,
    ).toMatchObject({ status: 'inProgress', agents: [{ id: 'child', status: 'inProgress' }] });
    const browser = itemMessage(
      { id: 'browser', type: 'mcpToolCall', server: 'playwright', tool: 'click' },
      'turn',
    );
    expect(browser?.activity?.kind).toBe('browser');
    expect(browser?.generatedImages).toBeUndefined();
  });

  it('adopts later child completion across tool snapshots without mutating history or crossing turn ownership', () => {
    const spawn = itemMessage(
      {
        id: 'spawn',
        type: 'collabAgentToolCall',
        status: 'completed',
        agentsStates: { child: { status: 'running' } },
      },
      'turn',
    );
    const wait = itemMessage(
      {
        id: 'wait',
        type: 'collabAgentToolCall',
        status: 'completed',
        agentsStates: { child: { status: 'completed', message: 'Reviewed.' } },
      },
      'turn',
    );
    const other = itemMessage(
      {
        id: 'other',
        type: 'collabAgentToolCall',
        status: 'completed',
        agentsStates: { child: { status: 'running' } },
      },
      'later-turn',
    );
    if (!spawn || !wait || !other) throw new Error('Missing agent snapshots');
    const states = agentStatesByTurn([spawn, wait, other]);
    expect(isLiveActivity(spawn, states.get('turn'))).toBe(false);
    expect(states.get('turn')?.get('child')).toMatchObject({ status: 'completed', result: 'Reviewed.' });
    expect(isLiveActivity(other, states.get('later-turn'))).toBe(true);
    expect(spawn.activity?.agents?.[0]?.status).toBe('inProgress');
  });
});

it('preserves trusted local message timestamps while persisting unknown recovered provider times honestly', () => {
  const recovered = itemMessage({ id: 'answer', type: 'agentMessage', text: 'Recovered answer' }, 'turn');
  if (!recovered) throw new Error('Missing provider message');
  recovered.timestampKnown = false;
  const stored = sessionSchema.parse({
    id: 'chat',
    scope: { brandId: 'brand', videoId: null, clipId: null },
    topic: 'brand',
    title: 'Brand',
    threadId: 'thread',
    messages: [{ ...recovered, createdAt: '2026-10-07T12:00:00Z', timestampKnown: true }],
    open: true,
    updatedAt: '2026-10-07T12:00:00Z',
  });
  const provider = { id: 'thread', messages: [recovered], turnIds: ['turn'] };
  expect(mergeThreadHistory(stored, provider).messages[0]).toMatchObject({
    createdAt: '2026-10-07T12:00:00Z',
    timestampKnown: true,
  });
  stored.messages = [recovered];
  expect(sessionSchema.parse(mergeThreadHistory(stored, provider)).messages[0]?.timestampKnown).toBe(false);
});
