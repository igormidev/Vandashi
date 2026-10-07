import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { AgentEvent } from '../src/domain/agent';
import { CodexAgent } from '../src/infrastructure/codex/client';
import { CodexTransport } from '../src/infrastructure/codex/transport';

it.skipIf(process.env['VANDASHI_CHAT_REFACTOR_LIVE'] !== '1')(
  'retains actual Codex tool lifecycle, final output and settled provider history',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vandashi-chat-refactor-live-'));
    const source = 'The verified phrase is: ORCHID SEVEN.\n';
    await writeFile(join(directory, 'evidence.txt'), source);
    const transport = new CodexTransport();
    const agent = new CodexAgent({
      transportFactory: async () => {
        await transport.initialize();
        return { client: transport, version: 'live' };
      },
    });
    const threads = new Set<string>();
    const events: AgentEvent[] = [];
    try {
      expect((await agent.connect()).authenticated).toBe(true);
      const models = await agent.models();
      const model = models.find((entry) => entry.id === 'gpt-6-luna') ?? models[0];
      expect(model).toBeDefined();
      if (!model) throw new Error('No live Codex model is available');
      const result = await agent.run(
        {
          threadId: null,
          cwd: directory,
          mode: 'read',
          writableRoots: [],
          attachments: [],
          selection: {
            model: model.id,
            reasoning: model.reasoning.includes('medium') ? 'medium' : model.defaultReasoning,
            fast: false,
          },
          prompt:
            'This is a read-only integration verification. Briefly announce that you will inspect evidence.txt, then use the shell tool to read that exact file. Do not modify any file or run other commands. In your final answer return only the verified phrase from the file.',
        },
        (event) => {
          events.push(event);
          if (event.type === 'thread') threads.add(event.threadId);
        },
      );
      expect(result.status).toBe('completed');
      expect(result.output.trim()).toMatch(/^ORCHID SEVEN\.?$/u);
      const messages = events.flatMap((event) => (event.type === 'message' ? [event.message] : []));
      const tools = messages.filter((message) => message.role === 'tool');
      expect(tools.some((message) => message.activity?.status === 'inProgress')).toBe(true);
      expect(tools.some((message) => message.activity?.status === 'completed')).toBe(true);
      expect(tools.some((message) => message.text.includes('ORCHID SEVEN'))).toBe(true);
      expect(messages.some((message) => message.role === 'assistant' && message.streaming === false)).toBe(
        true,
      );
      const history = await agent.readThread(result.threadId);
      expect(history.turnIds).toContain(result.turnId);
      expect(
        history.messages.some(
          (message) =>
            message.role === 'assistant' &&
            /^ORCHID SEVEN\.?$/u.test(message.text.trim()) &&
            message.streaming === false,
        ),
      ).toBe(true);
      expect(history.messages.some((message) => message.activity?.status === 'completed')).toBe(true);
      expect(await readFile(join(directory, 'evidence.txt'), 'utf8')).toBe(source);
      const next = await agent.run(
        {
          threadId: result.threadId,
          cwd: directory,
          mode: 'read',
          writableRoots: [],
          attachments: [],
          selection: { model: model.id, reasoning: model.defaultReasoning, fast: false },
          prompt: 'Do not use tools. Reply exactly SECOND.',
        },
        () => undefined,
      );
      expect(next.status).toBe('completed');
      const beforeSecond = await agent.forkBefore(result.threadId, next.turnId);
      threads.add(beforeSecond.id);
      expect(beforeSecond.turnIds).toEqual([result.turnId]);
      const beforeFirst = await agent.forkBefore(result.threadId, result.turnId);
      threads.add(beforeFirst.id);
      expect(beforeFirst.turnIds).toEqual([]);
      const throughFirst = await agent.forkThrough(result.threadId, result.turnId);
      threads.add(throughFirst.id);
      expect(throughFirst.turnIds).toEqual([result.turnId]);
      expect((await agent.readThread(result.threadId)).turnIds).toEqual([result.turnId, next.turnId]);
    } finally {
      for (const threadId of threads)
        await transport.request('thread/archive', { threadId }).catch(() => undefined);
      await transport.close();
      agent.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  },
  180_000,
);
