import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { CodexAgent } from '../src/infrastructure/codex/client';
import { CodexTransport } from '../src/infrastructure/codex/transport';
import { object, string } from '../src/infrastructure/codex/schemas';

it.skipIf(process.env['VANDASHI_CONTEXT_USAGE_LIVE'] !== '1')(
  'reads actual native context and account limits, waits for manual compact completion, and continues the same read-only thread',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vandashi-context-live-'));
    const transport = new CodexTransport();
    const initialized = object(await transport.initialize());
    const agent = new CodexAgent({
      transportFactory: () =>
        Promise.resolve({ client: transport, version: string(initialized['userAgent']) }),
    });
    let threadId: string | null = null;
    try {
      const models = await agent.models();
      const model = models.find((entry) => /luna/u.test(entry.id)) ?? models[0];
      if (!model) throw new Error('No Codex model available');
      const selection = {
        model: model.id,
        reasoning: model.reasoning.includes('low') ? 'low' : model.defaultReasoning,
        fast: false,
      };
      const options = { cwd: root, mode: 'read' as const, writableRoots: [], selection };
      const first = await agent.run(
        {
          ...options,
          threadId: null,
          attachments: [],
          prompt:
            'Remember this exact private integration marker: SILVER_OTTER_7419. Do not read or write any files, run tools, or inspect this computer. Reply exactly MARKER_STORED.',
        },
        () => undefined,
      );
      threadId = first.threadId;
      expect(first.status).toBe('completed');
      const before = await agent.usage(threadId);
      expect(before.context?.usedTokens).toBeGreaterThan(0);
      expect(before.context?.maxTokens).toBeGreaterThan(0);
      expect(before.account.available).toBe(before.account.windows.length > 0);
      const activity: string[] = [];
      await agent.compactThread(threadId, options, (event) => {
        if (event.type === 'message' && event.message.activity?.kind === 'compaction')
          activity.push(event.message.activity.status);
      });
      expect(activity).toContain('inProgress');
      expect(activity.at(-1)).toBe('completed');
      const after = await agent.usage(threadId);
      expect(after.context?.observedAt).toBeDefined();
      const follow = await agent.run(
        {
          ...options,
          threadId,
          attachments: [],
          prompt:
            'This is a new integration turn. Reply only SAME_THREAD_CONTINUED. This overrides the earlier instruction to reply MARKER_STORED. Do not use tools.',
        },
        () => undefined,
      );
      expect(follow.status).toBe('completed');
      expect(follow.threadId).toBe(threadId);
      expect(follow.turnId).not.toBe(first.turnId);
      expect(follow.output.trim()).toBe('SAME_THREAD_CONTINUED');
      const history = await agent.readThread(threadId);
      expect(history.messages.some((message) => message.text.includes('MARKER_STORED'))).toBe(true);
      expect(history.messages.some((message) => message.text.includes('SAME_THREAD_CONTINUED'))).toBe(true);
    } finally {
      if (threadId) await transport.request('thread/archive', { threadId }).catch(() => undefined);
      await transport.close();
      agent.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
  180_000,
);
