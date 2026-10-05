import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { CodexAgent } from '../src/infrastructure/codex/client';
import { CodexTransport } from '../src/infrastructure/codex/transport';

it.skipIf(process.env['VANDASHI_CODEX_LIVE'] !== '1')(
  'executes the real host-setup policy outside its cwd and resumes verified history',
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'vandashi-host-setup-'));
    const outside = await mkdtemp(join(tmpdir(), 'vandashi-host-proof-'));
    const proof = join(outside, 'setup-proof.txt');
    const agent = new CodexAgent();
    const created: string[] = [];
    try {
      const models = await agent.models();
      const model = models.find((entry) => entry.id === 'gpt-6-luna');
      if (!model) throw new Error('The live verification model is unavailable.');
      const result = await agent.run(
        {
          cwd,
          mode: 'edit',
          purpose: 'host-setup',
          writableRoots: [],
          threadId: null,
          attachments: [],
          selection: {
            model: model.id,
            reasoning: model.reasoning.includes('low') ? 'low' : model.defaultReasoning,
            fast: false,
          },
          prompt: `Vandashi setup protocol smoke test. Use the shell tool to write exactly HOST_SETUP_OK into ${JSON.stringify(proof)}, outside your cwd. This single disposable verification file is the entire authorized change. Do not install software or edit any other file. Read it back and report the exact content.`,
        },
        (event) => {
          if (event.type === 'thread') created.push(event.threadId);
        },
      );
      expect(result.status).toBe('completed');
      expect((await readFile(proof, 'utf8')).trim()).toBe('HOST_SETUP_OK');
      await agent.refreshConfiguration();
      const history = await agent.readThread(result.threadId);
      expect(history.turnIds).toContain(result.turnId);
      expect(
        history.messages.some(
          (message) => message.role === 'assistant' && message.text.includes('HOST_SETUP_OK'),
        ),
      ).toBe(true);
    } finally {
      await agent.refreshConfiguration();
      const cleanup = new CodexTransport();
      try {
        await cleanup.initialize();
        for (const threadId of created)
          await cleanup.request('thread/archive', { threadId }).catch(() => undefined);
      } finally {
        await cleanup.close();
        await rm(cwd, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
      }
    }
  },
  180_000,
);
