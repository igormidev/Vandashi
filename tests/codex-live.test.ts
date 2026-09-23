import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexAgent } from '../src/infrastructure/codex/client';
import { CodexTransport } from '../src/infrastructure/codex/transport';
import { object } from '../src/infrastructure/codex/schemas';

describe.skipIf(process.env['VANDASHI_CODEX_LIVE'] !== '1')('installed Codex integration', () => {
  it('returns schema-constrained final output separately from tool progress commentary', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vandashi-json-'));
    await writeFile(
      join(directory, 'changes.txt'),
      'The brand description changed from A local channel to Videos about city history.',
    );
    const transport = new CodexTransport();
    const items: unknown[] = [];
    const created: string[] = [];
    const agent = new CodexAgent({
      transportFactory: async () => {
        await transport.initialize();
        transport.subscribe((event) => {
          if (event.method === 'item/completed') {
            const item = object(object(event.params)['item']);
            if (item['type'] === 'agentMessage') items.push(item);
          }
        });
        return { client: transport, version: 'live' };
      },
    });
    try {
      const result = await agent.run(
        {
          threadId: null,
          cwd: directory,
          mode: 'read',
          writableRoots: [],
          attachments: [],
          selection: { model: 'gpt-6-luna', reasoning: 'medium', fast: false },
          prompt:
            'First briefly tell the user you will inspect the changes. Then use the shell to read changes.txt and propose a concise commit title and useful body for that change. Do not modify files. Your final answer must be JSON only with title and body.',
          outputSchema: {
            type: 'object',
            properties: { title: { type: 'string' }, body: { type: 'string' } },
            required: ['title', 'body'],
            additionalProperties: false,
          },
        },
        (event) => {
          if (event.type === 'thread') created.push(event.threadId);
        },
      );
      expect(result.status).toBe('completed');
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.output) as unknown;
      } catch {
        throw new Error(`Structured output failed: ${JSON.stringify({ output: result.output, items })}`);
      }
      expect(typeof object(parsed)['title']).toBe('string');
      expect(typeof object(parsed)['body']).toBe('string');
    } finally {
      for (const threadId of created)
        await transport.request('thread/archive', { threadId }).catch(() => undefined);
      agent.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  }, 180_000);
  it('enforces the actual read-only command sandbox', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vandashi-readonly-'));
    const transport = new CodexTransport();
    try {
      await transport.initialize();
      const output = object(
        await transport.request('command/exec', {
          cwd: directory,
          command: ['/bin/sh', '-c', 'printf forbidden > sentinel.txt'],
          sandboxPolicy: { type: 'readOnly', networkAccess: false },
        }),
      );
      expect(output['exitCode']).not.toBe(0);
      await expect(readFile(join(directory, 'sentinel.txt'))).rejects.toThrow();
    } finally {
      transport.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('streams real turns, resumes persisted history, and forks exactly before a turn', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vandashi-history-'));
    const agent = new CodexAgent();
    const created: string[] = [];
    try {
      const account = await agent.connect();
      expect(account.authenticated).toBe(true);
      const models = await agent.models();
      const luna = models.find((model) => model.id === 'gpt-6-luna');
      expect(luna).toBeDefined();
      const selection = { model: 'gpt-6-luna', reasoning: 'low', fast: false };
      const options = { cwd: directory, mode: 'read' as const, writableRoots: [directory], selection };
      const threadId = await agent.createThread(options);
      created.push(threadId);
      const first = await agent.run(
        {
          ...options,
          threadId,
          prompt: 'Protocol test. Do not use tools. Reply exactly ALPHA.',
          attachments: [],
        },
        () => undefined,
      );
      expect(first.status).toBe('completed');
      expect(first.output.trim()).toBe('ALPHA');
      const second = await agent.run(
        {
          ...options,
          threadId,
          prompt: 'Protocol test. Do not use tools. Reply exactly BETA.',
          attachments: [],
        },
        () => undefined,
      );
      expect(second.status).toBe('completed');
      const history = await agent.readThread(threadId);
      expect(history.turnIds).toEqual([first.turnId, second.turnId]);
      const fork = await agent.forkBefore(threadId, second.turnId);
      created.push(fork.id);
      expect(fork.turnIds).toEqual([first.turnId]);
      expect(
        fork.messages.filter((message) => message.role === 'assistant').map((message) => message.text),
      ).toEqual(['ALPHA']);
      agent.dispose();
      const resumed = await agent.readThread(fork.id);
      expect(resumed.turnIds).toEqual([first.turnId]);
    } finally {
      agent.dispose();
      const cleanup = new CodexTransport();
      try {
        await cleanup.initialize();
        for (const threadId of created) {
          try {
            await cleanup.request('thread/archive', { threadId });
          } catch {
            /* Unstarted threads have no persisted rollout. */
          }
        }
      } finally {
        cleanup.close();
        await rm(directory, { recursive: true, force: true });
      }
    }
  }, 180_000);
});
