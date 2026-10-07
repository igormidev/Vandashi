import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent, AgentRunInput } from '../src/domain/agent';
import type { AgentInputRequest } from '../src/domain/chat-input';
import { executeTurn } from '../src/infrastructure/codex/execution';
import { CodexTransport } from '../src/infrastructure/codex/transport';
import { parseUserInput } from '../src/infrastructure/codex/user-input';
import { parseInvocation } from '../src/desktop/validation';

const directories: string[] = [];
const transports: CodexTransport[] = [];
afterEach(async () => {
  await Promise.all(transports.splice(0).map((transport) => transport.close()));
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
const providerInput = {
  threadId: 'thread',
  turnId: 'turn',
  itemId: 'question-item',
  questions: [
    {
      id: 'choice',
      header: 'Style',
      question: 'Which style should I use?',
      isOther: true,
      isSecret: false,
      options: [{ label: 'Quiet', description: 'Use restrained transitions.' }],
    },
  ],
};
const input: AgentRunInput = {
  threadId: 'thread',
  cwd: '/workspace',
  writableRoots: ['/workspace'],
  mode: 'read',
  interactive: true,
  selection: { model: 'fixture', reasoning: 'medium', fast: false },
  prompt: 'Question',
  attachments: [],
};

async function transportFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'vandashi-chat-input-'));
  directories.push(directory);
  const binary = join(directory, 'codex-fixture.mjs');
  const receipt = join(directory, 'response.json');
  await writeFile(
    binary,
    `#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
const emit = value => process.stdout.write(JSON.stringify(value) + '\\n');
const complete = status => emit({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status,items:[]}}});
createInterface({input:process.stdin}).on('line', line => {
  const message = JSON.parse(line);
  if(message.method === 'initialize') emit({id:message.id,result:{userAgent:'fixture'}});
  if(message.method === 'turn/start') {
    writeFileSync(${JSON.stringify(join(directory, 'turn.json'))}, JSON.stringify(message.params));
    emit({id:message.id,result:{turn:{id:'turn',status:'inProgress'}}});
    emit({id:'provider-question',method:'item/tool/requestUserInput',params:${JSON.stringify(providerInput)}});
    if(message.params.input[0].text === 'Crash') setTimeout(() => process.exit(7), 50);
    if(message.params.input[0].text === 'Resolve') setTimeout(() => {
      emit({method:'serverRequest/resolved',params:{threadId:'thread',requestId:'provider-question'}});
      complete('completed');
    }, 50);
  }
  if(message.id === 'provider-question') {
    writeFileSync(${JSON.stringify(receipt)}, JSON.stringify(message));
    if(message.result || message.error?.code === -32602) complete('completed');
  }
  if(message.method === 'turn/interrupt') {emit({id:message.id,result:{}});complete('interrupted');}
});
`,
    { mode: 0o755 },
  );
  const transport = new CodexTransport(binary);
  transports.push(transport);
  await transport.initialize();
  return { transport, receipt, directory };
}

describe('structured Codex questions', () => {
  it('keeps a real server request unanswered past inactivity, validates its identity, and preserves the exact answer', async () => {
    const { transport, receipt, directory } = await transportFixture();
    const events: AgentEvent[] = [];
    let pending: AgentInputRequest | null = null;
    const result = executeTurn(transport, 'thread', input, {
      supportsImages: false,
      inactivityMs: 40,
      onTurn: () => undefined,
      onEvent: (event) => {
        events.push(event);
        if (event.type === 'user-input') pending = event.request;
      },
    });
    await vi.waitFor(() => {
      expect(pending).not.toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(readFile(receipt)).rejects.toMatchObject({ code: 'ENOENT' });
    const request = pending as unknown as AgentInputRequest;
    const response = {
      requestId: request.requestId,
      threadId: request.threadId,
      turnId: request.turnId,
      answers: { choice: ['Other style 日本\nKeep this exact text.'] },
    };
    await expect(transport.respondUserInput({ ...response, turnId: 'old-turn' })).rejects.toThrow();
    await expect(transport.respondUserInput({ ...response, answers: {} })).rejects.toThrow();
    await transport.respondUserInput(response);
    expect(await result).toMatchObject({ status: 'completed', turnId: 'turn' });
    expect(JSON.parse(await readFile(receipt, 'utf8'))).toEqual({
      id: 'provider-question',
      result: { answers: { choice: { answers: response.answers.choice } } },
    });
    await expect(transport.respondUserInput(response)).rejects.toThrow();
    expect(events.filter((event) => event.type === 'user-input').at(-1)).toEqual({
      type: 'user-input',
      request: null,
    });
    expect(JSON.parse(await readFile(join(directory, 'turn.json'), 'utf8'))).toMatchObject({
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'readOnly', networkAccess: true },
    });
  });

  it('returns a protocol error for background questions without sending fabricated empty answers', async () => {
    const { transport, receipt } = await transportFixture();
    const result = await executeTurn(
      transport,
      'thread',
      { ...input, interactive: false },
      {
        supportsImages: false,
        onEvent: () => undefined,
        onTurn: () => undefined,
      },
    );
    expect(result.status).toBe('completed');
    const response: unknown = JSON.parse(await readFile(receipt, 'utf8'));
    expect(response).toMatchObject({ id: 'provider-question', error: { code: -32602 } });
    expect(response).not.toHaveProperty('result');
  });

  it('clears waiting input on cancellation and rejects an answer after its turn was interrupted', async () => {
    const { transport, receipt } = await transportFixture();
    const state = { request: null as AgentInputRequest | null };
    const events: AgentEvent[] = [];
    const running = executeTurn(transport, 'thread', input, {
      supportsImages: false,
      onTurn: () => undefined,
      onEvent: (event) => {
        events.push(event);
        if (event.type === 'user-input' && event.request) state.request = event.request;
      },
    });
    await vi.waitFor(() => {
      expect(state.request).not.toBeNull();
    });
    transport.dismissUserInput('thread', 'turn');
    await transport.request('turn/interrupt', { threadId: 'thread', turnId: 'turn' });
    expect(await running).toMatchObject({ status: 'interrupted' });
    expect(JSON.parse(await readFile(receipt, 'utf8'))).toMatchObject({ error: { code: -32800 } });
    await expect(
      transport.respondUserInput({
        requestId: state.request?.requestId ?? '',
        threadId: 'thread',
        turnId: 'turn',
        answers: { choice: ['Quiet'] },
      }),
    ).rejects.toThrow();
    expect(events.filter((event) => event.type === 'user-input').at(-1)).toEqual({
      type: 'user-input',
      request: null,
    });
  });

  it('clears pending questions after a real provider process exits', async () => {
    const { transport } = await transportFixture();
    const events: AgentEvent[] = [];
    const running = executeTurn(
      transport,
      'thread',
      { ...input, prompt: 'Crash' },
      {
        supportsImages: false,
        onTurn: () => undefined,
        onEvent: (event) => events.push(event),
      },
    );
    await expect(running).rejects.toMatchObject({ code: 'unavailable' });
    expect(events.filter((event) => event.type === 'user-input').at(-1)).toEqual({
      type: 'user-input',
      request: null,
    });
  });

  it('clears provider-resolved requests without replying again or accepting a stale answer', async () => {
    const { transport, receipt } = await transportFixture();
    const events: AgentEvent[] = [];
    const running = executeTurn(
      transport,
      'thread',
      { ...input, prompt: 'Resolve' },
      {
        supportsImages: false,
        onTurn: () => undefined,
        onEvent: (event) => events.push(event),
      },
    );
    expect(await running).toMatchObject({ status: 'completed' });
    await expect(readFile(receipt)).rejects.toMatchObject({ code: 'ENOENT' });
    const request = events.find((event) => event.type === 'user-input' && event.request);
    if (request?.type !== 'user-input' || !request.request) throw new Error('Provider question missing');
    await expect(
      transport.respondUserInput({
        requestId: request.request.requestId,
        threadId: 'thread',
        turnId: 'turn',
        answers: { choice: ['Quiet'] },
      }),
    ).rejects.toThrow();
    expect(events.filter((event) => event.type === 'user-input').at(-1)).toEqual({
      type: 'user-input',
      request: null,
    });
  });

  it('rejects ambiguous or oversized questions and unsafe answer maps at the production boundaries', () => {
    const duplicate = {
      ...providerInput,
      questions: [providerInput.questions[0], providerInput.questions[0]],
    };
    expect(parseUserInput(duplicate, crypto.randomUUID())).toBeNull();
    expect(
      parseUserInput(
        { ...providerInput, questions: [{ ...providerInput.questions[0], id: '__proto__' }] },
        'id',
      ),
    ).toBeNull();
    expect(
      parseUserInput(
        {
          ...providerInput,
          questions: [
            { ...providerInput.questions[0], options: Array(21).fill({ label: 'A', description: '' }) },
          ],
        },
        'id',
      ),
    ).toBeNull();
    const answer = {
      sessionId: 'session',
      requestId: crypto.randomUUID(),
      threadId: 'thread',
      turnId: 'turn',
      answers: { choice: ['Quiet'] },
    };
    expect(parseInvocation('respondChatInput', [answer]).method).toBe('respondChatInput');
    expect(() => parseInvocation('respondChatInput', [{ ...answer, answers: {} }])).toThrow();
    expect(() =>
      parseInvocation('respondChatInput', [{ ...answer, answers: { choice: ['a', 'b'] } }]),
    ).toThrow();
    const unsafeAnswers: unknown = JSON.parse('{"__proto__":["bad"]}');
    expect(() => parseInvocation('respondChatInput', [{ ...answer, answers: unsafeAnswers }])).toThrow();
    expect(() => parseInvocation('respondChatInput', [{ ...answer, writableRoots: ['/'] }])).toThrow();
  });
});
