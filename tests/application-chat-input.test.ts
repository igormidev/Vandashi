import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent, AgentPort, AgentRunResult } from '../src/domain/agent';
import type { ChatInputRequest, ChatInputResponse } from '../src/domain/chat-input';
import { createBackend } from '../src/application/backend';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

const fixtures: ApplicationFixture[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

async function waitingChat(collaboration: 'default' | 'plan' = 'default') {
  const fixture = await applicationFixture();
  fixtures.push(fixture);
  const pending: ChatInputRequest = {
    sessionId: fixture.session.id,
    requestId: crypto.randomUUID(),
    threadId: 'question-thread',
    turnId: 'question-turn',
    itemId: 'question-item',
    questions: [
      {
        id: 'style',
        header: 'Style',
        question: 'Choose the style.',
        isOther: false,
        isSecret: false,
        options: [{ label: 'Quiet', description: 'Restrained movement.' }],
      },
    ],
  };
  let event: ((input: AgentEvent) => void) | undefined;
  let finish: ((result: AgentRunResult) => void) | undefined;
  let fail: ((error: Error) => void) | undefined;
  const responder = vi.fn<NonNullable<AgentPort['respondUserInput']>>(() => Promise.resolve());
  fixture.agent.run.mockImplementation((input, onEvent) => {
    if (!input.interactive) throw new Error('Foreground questions were not enabled');
    event = onEvent;
    onEvent({ type: 'thread', threadId: pending.threadId });
    onEvent({ type: 'turn', turnId: pending.turnId });
    onEvent({ type: 'user-input', request: pending });
    return new Promise((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
  });
  const api = createBackend(
    fixture.store,
    fixture.git,
    { ...fixture.agent, respondUserInput: responder },
    fixture.media,
    fixture.host,
    (input) => fixture.events.push(input),
  );
  await api.sendChat({ ...fixture.request, mode: 'read', collaboration });
  const response: ChatInputResponse = {
    sessionId: pending.sessionId,
    requestId: pending.requestId,
    threadId: pending.threadId,
    turnId: pending.turnId,
    answers: { style: ['Quiet'] },
  };
  return {
    fixture,
    api,
    pending,
    responder,
    response,
    complete: () => {
      event?.({ type: 'user-input', request: null });
      finish?.({
        threadId: pending.threadId,
        turnId: pending.turnId,
        status: 'completed',
        output: '',
        error: null,
      });
    },
    fail: () => fail?.(new Error('Provider exited while awaiting input.')),
  };
}

describe('application question ownership', () => {
  it('propagates Plan collaboration separately from its read-only mode and commits no creative edits', async () => {
    const { fixture, api, response, complete } = await waitingChat('plan');
    const head = await fixture.git.head(fixture.path);
    expect(fixture.agent.run.mock.calls.at(-1)?.[0]).toMatchObject({
      interactive: true,
      collaboration: 'plan',
      mode: 'read',
      writableRoots: [],
    });
    await api.respondChatInput(response);
    complete();
    await fixture.idle();
    expect(await fixture.git.head(fixture.path)).toBe(head);
    expect((await fixture.git.status(fixture.path)).dirty).toBe(false);
  });
  it('retains the exact pending request through failed response, rejects stale identities and reserves one answer owner', async () => {
    const { fixture, api, pending, responder, response, complete } = await waitingChat();
    expect(await api.pendingChatInput(fixture.session.id)).toEqual(pending);
    expect(await api.pendingChatInput('another-session')).toBeNull();
    await expect(api.respondChatInput({ ...response, sessionId: 'another-session' })).rejects.toThrow();
    await expect(api.respondChatInput({ ...response, requestId: crypto.randomUUID() })).rejects.toThrow();
    await expect(
      api.respondChatInput({ ...response, answers: { style: ['Unknown option'] } }),
    ).rejects.toThrow();
    expect(responder).not.toHaveBeenCalled();

    responder.mockRejectedValueOnce(new Error('Retry this response.'));
    await expect(api.respondChatInput(response)).rejects.toThrow('Retry this response');
    expect(await api.pendingChatInput(fixture.session.id)).toEqual(pending);
    let acknowledge: (() => void) | undefined;
    responder.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    const sending = api.respondChatInput(response);
    await expect(api.respondChatInput(response)).rejects.toThrow();
    expect(responder).toHaveBeenCalledTimes(2);
    acknowledge?.();
    await sending;
    expect(await api.pendingChatInput(fixture.session.id)).toBeNull();
    await expect(api.respondChatInput(response)).rejects.toThrow();
    complete();
    await fixture.idle();
    const session = (await api.sessions(fixture.scope)).find((entry) => entry.id === fixture.session.id);
    expect(session?.messages.map((message) => message.text).join('\n')).not.toContain(
      pending.questions[0]?.question,
    );
    expect(await api.pendingChatInput(fixture.session.id)).toBeNull();
  });

  it('clears the snapshot after provider failure before releasing the operation and never accepts its old answer', async () => {
    const { fixture, api, response, fail } = await waitingChat();
    fail();
    await vi.waitFor(async () => {
      expect(await api.pendingChatInput(fixture.session.id)).toBeNull();
      expect(
        fixture.events.some((event) => event.type === 'activity' && event.activity.phase === 'error'),
      ).toBe(true);
    });
    await expect(api.respondChatInput(response)).rejects.toThrow();
    const cleared = fixture.events.filter((event) => event.type === 'chat-input').at(-1);
    expect(cleared).toEqual({ type: 'chat-input', sessionId: fixture.session.id, request: null });
  });
});
