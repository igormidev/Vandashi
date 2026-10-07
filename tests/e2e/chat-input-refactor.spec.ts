import { test, expect } from './development-fixtures';
import type { ChatInputRequest } from '../../src/domain/chat-input';
import { installChatInputFixture, inputControl, inputResponses } from './chat-input-fixture';

const request: ChatInputRequest = {
  sessionId: 'chat-one',
  requestId: '0046cfd9-f3cd-4c9f-9624-03930f0c5e78',
  threadId: 'question-thread',
  turnId: 'question-turn',
  itemId: 'question-item',
  questions: [
    {
      id: 'style',
      header: 'Style',
      question: 'Which style should the next video use?',
      isOther: true,
      isSecret: false,
      options: [
        { label: 'Quiet', description: 'Restrained transitions and gentle camera movement.' },
        { label: 'Lively', description: 'Quick cuts and expressive animation.' },
      ],
    },
    {
      id: 'guidance',
      header: 'Guidance',
      question: 'What should the opening emphasize?',
      isOther: false,
      isSecret: false,
      options: [],
    },
  ],
};

test('structured questions use native keyboard choices and retain exact answers through a failed acknowledgement', async ({
  desktopApp,
  page,
}) => {
  await installChatInputFixture(desktopApp, request, { delayedAnswer: true });
  await page.reload();
  const panel = page.getByRole('region', { name: 'Your input', exact: true });
  await expect(panel).toBeVisible();
  const quiet = panel.getByRole('radio', {
    name: 'Quiet Restrained transitions and gentle camera movement.',
  });
  await quiet.check();
  await quiet.press('ArrowDown');
  await expect(
    panel.getByRole('radio', { name: 'Lively Quick cuts and expressive animation.' }),
  ).toBeChecked();
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  const answer = panel.getByRole('textbox', { name: 'Answer', exact: true });
  const raw = 'Start with the city lights.\nKeep this exact 日本語 guidance.';
  await answer.fill(raw);
  await panel.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  await expect(answer).toBeDisabled();
  await inputControl(desktopApp, { answer: 'failure' });
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(answer).toHaveValue(raw);
  await panel.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    panel.getByRole('radio', { name: 'Lively Quick cuts and expressive animation.' }),
  ).toBeChecked();
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  await panel.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  expect(await inputResponses(desktopApp)).toEqual([
    {
      sessionId: request.sessionId,
      requestId: request.requestId,
      threadId: request.threadId,
      turnId: request.turnId,
      answers: { style: ['Lively'], guidance: [raw] },
    },
    {
      sessionId: request.sessionId,
      requestId: request.requestId,
      threadId: request.threadId,
      turnId: request.turnId,
      answers: { style: ['Lively'], guidance: [raw] },
    },
  ]);
  await inputControl(desktopApp, { answer: 'success' });
  await expect(panel).toHaveCount(0);
});

test('a late pending snapshot cannot restore a cleared question during development effect replay', async ({
  desktopApp,
  page,
}) => {
  await installChatInputFixture(desktopApp, request, { delayedSnapshot: true });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toBeVisible();
  await inputControl(desktopApp, { request: null });
  await inputControl(desktopApp, { snapshot: true });
  const panel = page.getByRole('region', { name: 'Your input', exact: true });
  await expect(panel).toHaveCount(0);
  await inputControl(desktopApp, { request });
  await expect(panel).toBeVisible();
  await panel.getByRole('radio', { name: 'Other', exact: true }).check();
  await panel.getByRole('textbox', { name: 'Answer', exact: true }).fill('A handmade paper animation.');
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Answer', exact: true }).fill('Warm light.');
  await page.screenshot({ path: '/tmp/vandashi-chat-questions-20261007.png' });
  await panel.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect((await inputResponses(desktopApp))[0]?.answers).toEqual({
    style: ['A handmade paper animation.'],
    guidance: ['Warm light.'],
  });
});

test('ten choices and queued messages retain visible answer and Stop controls at the native minimum size', async ({
  desktopApp,
  page,
}) => {
  const firstQuestion = request.questions[0];
  if (!firstQuestion) throw new Error('Missing question fixture');
  const tall = {
    ...request,
    questions: [
      {
        ...firstQuestion,
        options: Array.from({ length: 10 }, (_, index) => ({
          label: `Visual direction ${String(index + 1)}`,
          description: 'Detailed creative guidance with wrapping text for the narrow chat pane.',
        })),
      },
    ],
  };
  await installChatInputFixture(desktopApp, tall, {
    initialQueue: Array.from({ length: 3 }, (_, index) => ({
      id: `0ec4bfa3-1ed8-4149-9aae-6126d0b65b5${String(index)}`,
      failed: false,
      request: {
        sessionId: request.sessionId,
        text: `Follow-up ${String(index + 1)}\nKeep the exact creative intent in this queued message.`,
        mode: 'read' as const,
        selection: { model: 'test-model', reasoning: 'low', fast: false },
        attachments: [],
      },
    })),
  });
  await desktopApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1200, 720);
  });
  await page.reload();
  const panel = page.getByRole('region', { name: 'Your input', exact: true });
  await expect(panel).toBeVisible();
  await panel
    .getByRole('radio', {
      name: 'Visual direction 1 Detailed creative guidance with wrapping text for the narrow chat pane.',
    })
    .check();
  const controls = await page.evaluate(() => {
    const panelElement = document.querySelector('.chat-input-panel');
    const toolbar = document.querySelector('.chat-toolbar');
    const submit = panelElement?.querySelector('.chat-input-actions .button');
    const stop = document.querySelector('.composer-actions button[aria-label="Stop"]');
    const questionBody = panelElement?.querySelector('.chat-input-question');
    if (!panelElement || !toolbar || !submit || !stop || !questionBody)
      throw new Error('Missing question controls');
    return {
      top: panelElement.getBoundingClientRect().top,
      toolbarBottom: toolbar.getBoundingClientRect().bottom,
      submitBottom: submit.getBoundingClientRect().bottom,
      stopBottom: stop.getBoundingClientRect().bottom,
      height: window.innerHeight,
      scrolls: questionBody.scrollHeight > questionBody.clientHeight,
    };
  });
  expect(controls.top).toBeGreaterThanOrEqual(controls.toolbarBottom);
  expect(controls.submitBottom).toBeLessThanOrEqual(controls.height);
  expect(controls.stopBottom).toBeLessThanOrEqual(controls.height);
  expect(controls.scrolls).toBe(true);
  await page.screenshot({ path: '/tmp/vandashi-chat-questions-minimum-20261007.png' });
  await panel.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test('a failed pending-input read offers an owned retry that restores the provider question', async ({
  desktopApp,
  page,
}) => {
  await installChatInputFixture(desktopApp, request, { snapshotFailure: true, delayedSnapshot: true });
  await page.reload();
  const panel = page.getByRole('region', { name: 'Your input', exact: true });
  await expect(panel.getByRole('alert')).toContainText('Pending input is temporarily unavailable.');
  await inputControl(desktopApp, { snapshotFailure: false });
  await panel.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  await expect(panel.getByRole('button', { name: 'Check again', exact: true })).toBeDisabled();
  await inputControl(desktopApp, { snapshot: true });
  const restoredQuestion = request.questions[0];
  if (!restoredQuestion) throw new Error('Missing question fixture');
  await expect(panel.getByRole('group', { name: restoredQuestion.question })).toBeVisible();
  await expect(panel.getByRole('alert')).toHaveCount(0);
});
