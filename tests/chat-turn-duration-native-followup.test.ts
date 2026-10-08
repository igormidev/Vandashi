import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { AgentEvent } from '../src/domain/agent';
import { CodexAgent } from '../src/infrastructure/codex/client';
import { object, string } from '../src/infrastructure/codex/schemas';
import { CodexTransport, type RpcClient } from '../src/infrastructure/codex/transport';

it.skipIf(process.env['VANDASHI_CODEX_TURN_TIMING'] !== '1')(
  'retains actual native completed-turn milliseconds through live answers and paginated history in a read-only scratch conversation',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vandashi-turn-duration-'));
    const transport = new CodexTransport();
    const events: AgentEvent[] = [];
    const created = new Set<string>();
    let raw: Record<string, unknown> | undefined;
    let turnPolicy: Record<string, unknown> | undefined;
    const client: RpcClient = {
      request: (method, params) => {
        if (method === 'turn/start') turnPolicy = object(params);
        return transport.request(method, params);
      },
      subscribe: (listener) => transport.subscribe(listener),
      onFailure: (listener) => transport.onFailure(listener),
      close: () => transport.close(),
    };
    const agent = new CodexAgent({
      transportFactory: async () => {
        const initialized = object(await transport.initialize());
        transport.subscribe((event) => {
          if (event.method === 'turn/completed') raw = object(object(event.params)['turn']);
        });
        return { client, version: string(initialized['userAgent']) };
      },
    });
    try {
      const account = await agent.connect();
      expect(account.authenticated).toBe(true);
      const models = await agent.models();
      const model = models.find((entry) => entry.id === 'gpt-6-luna');
      expect(model).toBeDefined();
      const result = await agent.run(
        {
          threadId: null,
          cwd: directory,
          mode: 'read',
          writableRoots: [],
          attachments: [],
          selection: { model: 'gpt-6-luna', reasoning: 'low', fast: false },
          prompt: 'Protocol timing check. Do not use tools or read or write files. Reply exactly TIMING_OK.',
        },
        (event) => {
          events.push(event);
          if (event.type === 'thread') created.add(event.threadId);
        },
      );
      expect(turnPolicy?.['approvalPolicy']).toBe('never');
      expect(object(turnPolicy?.['sandboxPolicy'])['type']).toBe('readOnly');
      expect(turnPolicy?.['runtimeWorkspaceRoots']).toEqual([directory]);
      expect(result.status).toBe('completed');
      expect(result.output.trim()).toBe('TIMING_OK');
      const duration = raw?.['durationMs'];
      expect(typeof duration).toBe('number');
      expect(Number.isSafeInteger(duration)).toBe(true);
      expect(Number(duration)).toBeGreaterThanOrEqual(0);
      const answers = events.flatMap((event) =>
        event.type === 'message' && event.message.role === 'assistant' && event.message.phase !== 'commentary'
          ? [event.message]
          : [],
      );
      expect(answers.at(-1)?.turnDurationMs).toBe(duration);
      const history = await agent.readThread(result.threadId);
      const final = history.messages.find((message) => message.id === answers.at(-1)?.id);
      expect(final?.turnDurationMs).toBe(duration);
      expect(final?.streaming).toBe(false);
      expect(history.turnIds).toEqual([result.turnId]);
      expect(events.some((event) => event.type === 'message' && event.message.role === 'tool')).toBe(false);
      expect(await readdir(directory)).toEqual([]);
      const evidenceFile = process.env['VANDASHI_CODEX_TIMING_EVIDENCE'];
      if (evidenceFile)
        await writeFile(
          evidenceFile,
          JSON.stringify(
            {
              model: model?.id,
              status: result.status,
              nativeStatus: raw?.['status'],
              durationMs: duration,
              startedAt: raw?.['startedAt'],
              completedAt: raw?.['completedAt'],
              liveDurationMs: answers.at(-1)?.turnDurationMs,
              historyDurationMs: final?.turnDurationMs,
              approvalPolicy: turnPolicy?.['approvalPolicy'],
              sandbox: object(turnPolicy?.['sandboxPolicy'])['type'],
              scratchEmpty: true,
            },
            null,
            2,
          ) + '\n',
          { flag: 'wx' },
        );
    } finally {
      for (const threadId of created)
        await transport.request('thread/archive', { threadId }).catch(() => undefined);
      agent.dispose();
      await transport.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  120_000,
);
