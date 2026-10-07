import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { CodexAgent } from '../src/infrastructure/codex/client';

async function liveQuestion(collaboration: 'default' | 'plan') {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-question-live-'));
  const agent = new CodexAgent();
  let requested = 0;
  const answers: Promise<void>[] = [];
  try {
    const models = await agent.models();
    const model =
      models.find((entry) => entry.id === 'gpt-6.1-sol') ??
      models.find((entry) => entry.isDefault) ??
      models[0];
    if (!model) throw new Error('No live model available.');
    const reasoning = model.reasoning.includes('low') ? 'low' : model.defaultReasoning;
    const result = await agent.run(
      {
        cwd: root,
        threadId: null,
        mode: 'read',
        writableRoots: [],
        interactive: true,
        collaboration,
        selection: { model: model.id, reasoning, fast: false },
        prompt:
          'This is a narrow integration check. Do not inspect files, run commands, or edit anything. Invoke your request_user_input tool now with one question id "style", header "Style", asking "Which visual style?", and options Quiet and Lively with short descriptions. Wait for the structured answer, then reply exactly REQUEST_USER_INPUT_CONFIRMED. If request_user_input is unavailable in your current mode, do not simulate it in text: reply exactly REQUEST_USER_INPUT_UNAVAILABLE.',
        attachments: [],
      },
      (event) => {
        if (event.type !== 'user-input' || !event.request) return;
        requested++;
        const request = event.request;
        answers.push(
          agent.respondUserInput({
            requestId: request.requestId,
            threadId: request.threadId,
            turnId: request.turnId,
            answers: Object.fromEntries(
              request.questions.map((question) => [question.id, [question.options[0]?.label ?? 'Quiet']]),
            ),
          }),
        );
      },
    );
    await Promise.all(answers);
    expect(result.status).toBe('completed');
    return { requested, output: result.output };
  } finally {
    await agent.refreshConfiguration();
    await rm(root, { recursive: true, force: true });
  }
}

it.skipIf(process.env['VANDASHI_CHAT_INPUT_LIVE'] !== '1')(
  'verifies structured-question availability with the real current read-only Codex mode',
  async () => {
    const result = await liveQuestion('default');
    expect(result.output.trim()).toBe(
      result.requested > 0 ? 'REQUEST_USER_INPUT_CONFIRMED' : 'REQUEST_USER_INPUT_UNAVAILABLE',
    );
  },
  120_000,
);

it.skipIf(process.env['VANDASHI_CHAT_INPUT_LIVE'] !== '1')(
  'answers an actual structured question in read-only Plan mode without changing approval or file authority',
  async () => {
    const result = await liveQuestion('plan');
    expect(result.requested, result.output).toBeGreaterThan(0);
  },
  120_000,
);
