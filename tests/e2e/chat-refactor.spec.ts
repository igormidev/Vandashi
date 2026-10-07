import { test, expect } from './development-fixtures';
import { chatControl, chatRequests } from './chat-fixture';
import { installChatRefactorFixture } from './chat-refactor-fixture';
import type { QueuedChat } from '../../src/domain/models';

function queued(id: string, text: string): QueuedChat {
  return {
    id,
    failed: false,
    request: {
      clientMessageId: id,
      sessionId: 'chat-one',
      text,
      mode: 'read',
      selection: { model: 'test-model', reasoning: 'low', fast: false },
      attachments: [],
    },
  };
}
const firstId = '6694e40a-aa22-415e-80dd-6ea09d683657';
const secondId = 'be8bb8a0-bc71-4fcb-97dc-75712c501ca0';

test('queued cards expand on hover and edit advances the queue without duplicate timeline messages', async ({
  desktopApp,
  page,
}) => {
  const long = Array.from(
    { length: 15 },
    (_, index) => `Line ${String(index + 1)} of the queued request.`,
  ).join('\n');
  await installChatRefactorFixture(desktopApp, {
    initialQueue: [queued(firstId, long), queued(secondId, 'Second queued request')],
  });
  await page.reload();
  const queue = page.getByRole('region', { name: 'Query', exact: true });
  await expect(queue).toBeVisible();
  const card = queue.locator('.queued-message').first();
  const text = card.locator('.queued-text');
  await expect(text).toHaveCSS('max-height', '36.3px');
  await card.hover();
  await expect(text).toHaveCSS('max-height', '90.75px');
  expect(await text.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await chatControl(desktopApp, {
    event: {
      type: 'chat-pending',
      sessionId: 'chat-one',
      id: firstId,
      message: {
        id: firstId,
        role: 'user',
        text: long,
        turnId: null,
        files: [],
        createdAt: '',
        pending: 'queued',
      },
    },
  });
  await expect(page.locator('.messages').getByText(long, { exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await expect
    .poll(() =>
      composer.evaluate((element) =>
        Array.from(element.querySelectorAll('p'), (line) => line.textContent).join('\n'),
      ),
    )
    .toBe(long);
  await expect(composer).toBeFocused();
  await expect(queue.locator('.queued-message')).toHaveCount(1);
  await expect(queue).toContainText('Second queued request');
  await expect(page.locator('.composer-actions').getByRole('combobox')).toContainText('Read only');
  await composer.press('ControlOrMeta+A');
  await composer.press('Backspace');
  await queue.locator('.queued-message').hover();
  await queue.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(composer).toHaveText('Second queued request');
  await expect(queue).toHaveCount(0);
});

test('queue edit owns removal through settlement and keeps the entry and draft after failure', async ({
  desktopApp,
  page,
}) => {
  await installChatRefactorFixture(desktopApp, {
    initialQueue: [queued(firstId, 'Keep this exact request')],
    delayedQueueRemoval: true,
  });
  await page.reload();
  const queue = page.getByRole('region', { name: 'Query', exact: true });
  const card = queue.locator('.queued-message');
  await card.hover();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await expect(composer).toHaveAttribute('aria-disabled', 'true');
  await expect(card).toHaveAttribute('aria-busy', 'true');
  await expect(card.getByRole('button', { name: 'Remove', exact: true })).toBeDisabled();
  await composer.press('Enter');
  await chatControl(desktopApp, { queueRemoval: 'failure' });
  await expect(composer).toHaveAttribute('contenteditable', 'true');
  await expect(composer).toHaveText('');
  await expect(card).toContainText('Keep this exact request');
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(card).toHaveAttribute('aria-busy', 'true');
  await chatControl(desktopApp, { queueRemoval: 'success' });
  await expect(composer).toHaveText('Keep this exact request');
  await expect(queue).toHaveCount(0);
  const requests = await chatRequests(desktopApp);
  expect(requests).toHaveLength(2);
});

test('queue edit preserves a current draft and remove settles immediately during active AI', async ({
  desktopApp,
  page,
}) => {
  await installChatRefactorFixture(desktopApp, {
    initialQueue: [queued(firstId, 'Remove only this request')],
  });
  await page.reload();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await expect(composer).toBeVisible();
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'chat-one', phase: 'working', detail: '' } },
  });
  await composer.fill('My unsent draft');
  const queue = page.getByRole('region', { name: 'Query', exact: true });
  await queue.locator('.queued-message').hover();
  await expect(queue.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
  await queue.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(queue).toHaveCount(0);
  await expect(composer).toHaveText('My unsent draft');
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
});

test('text fields avoid focus squares and the timeline scrolls behind the connected composer', async ({
  desktopApp,
  page,
}) => {
  await installChatRefactorFixture(desktopApp, {
    initialMessages: Array.from({ length: 40 }, (_, index) => ({
      id: `answer-${String(index)}`,
      role: 'assistant',
      text: `Answer ${String(index)} with enough text to fill the conversation.`,
      turnId: `turn-${String(index)}`,
      files: [],
      createdAt: '',
    })),
  });
  await page.reload();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.click();
  await expect(composer).toHaveCSS('outline-style', 'none');
  const name = page.getByRole('textbox', { name: 'Name', exact: true });
  await name.click();
  await expect(name).toHaveCSS('outline-style', 'none');
  const geometry = await page.locator('.messages').evaluate((element) => {
    const composerNode = document.querySelector('.chat-composer-slot:not([hidden])');
    const box = composerNode?.getBoundingClientRect();
    return {
      bottom: element.getBoundingClientRect().bottom,
      composerTop: box?.top ?? 0,
      padding: Number.parseFloat(getComputedStyle(element).paddingBottom),
      height: box?.height ?? 0,
    };
  });
  expect(geometry.bottom).toBeGreaterThan(geometry.composerTop + geometry.height - 2);
  expect(geometry.padding).toBeGreaterThanOrEqual(geometry.height);
  await page.locator('.messages').evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(page.getByRole('button', { name: 'Scroll to latest message', exact: true })).toBeVisible();
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: {
        id: 'latest',
        role: 'assistant',
        text: 'Latest streamed answer',
        turnId: 'new-turn',
        files: [],
        createdAt: '',
      },
    },
  });
  expect(await page.locator('.messages').evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'Scroll to latest message', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Scroll to latest message', exact: true })).toHaveCount(0);
  // Reopening starts with a cached selection before its sessions have hydrated.
  await page.reload();
  await expect(page.locator('.messages-content')).toContainText('Answer 39');
  await expect
    .poll(() =>
      page
        .locator('.chat-pane')
        .evaluate((element) => getComputedStyle(element).getPropertyValue('--composer-height')),
    )
    .not.toBe('');
  await expect
    .poll(() =>
      page
        .locator('.messages')
        .evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight),
    )
    .toBeLessThan(2);
});
