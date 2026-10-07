import type { ChatMessage } from '../../src/domain/models';
import { test, expect } from './development-fixtures';
import { installChatRefactorFixture } from './chat-refactor-fixture';
import { chatControl, chatRequests } from './chat-fixture';

const message = (
  id: string,
  role: ChatMessage['role'],
  text: string,
  turnId: string | null,
): ChatMessage => ({
  id,
  role,
  text,
  turnId,
  files: [],
  createdAt: '2026-10-07T12:00:00Z',
  streaming: false,
});
const history = () => [
  ...Array.from({ length: 92 }, (_, index) => [
    message(
      `user-${String(index)}`,
      'user',
      `Request ${String(index)}: keep this original guidance.`,
      `turn-${String(index)}`,
    ),
    message(
      `answer-${String(index)}`,
      'assistant',
      `${'A response paragraph with enough content for the timeline. '.repeat(6)}${index === 9 ? 'Buried needle 雪 <literal>' : `Answer ${String(index)}`}`,
      `turn-${String(index)}`,
    ),
  ]).flat(),
  {
    ...message('queued', 'user', 'A queued request that cannot be jumped to yet.', null),
    pending: 'queued' as const,
  },
  {
    ...message('sending', 'user', 'A request awaiting acceptance.', 'unaccepted'),
    pending: 'sending' as const,
  },
];

test('turn search finds full answer text beyond previews, jumps by exact user ID, and preserves the draft and native authority', async ({
  desktopApp,
  page,
}) => {
  await installChatRefactorFixture(desktopApp, { initialMessages: history(), observeLinkAccess: true });
  await page.reload();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.fill('Keep my unsent draft.');
  const before = await chatRequests(desktopApp);
  const scroll = page.locator('.messages');
  await scroll.evaluate((node) => {
    const row = node.querySelector<HTMLElement>('[data-message-id="user-5"]');
    if (!row) throw new Error('Missing fifth turn');
    node.scrollTop += row.getBoundingClientRect().top - node.getBoundingClientRect().top;
  });
  const trigger = page.getByRole('button', { name: 'Jump to turn', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Jump to turn', exact: true });
  const search = dialog.getByRole('combobox', { name: 'Search this conversation', exact: true });
  await expect(search).toBeFocused();
  await expect(dialog.getByRole('status')).toHaveText('92 turns');
  await expect(dialog.getByRole('option').filter({ hasText: 'Current turn' })).toContainText('Request 5:');
  await expect(dialog.getByRole('option')).toHaveCount(80);
  await expect(dialog).not.toContainText('A queued request');
  await expect(dialog).not.toContainText('A request awaiting acceptance');
  await search.fill('buried 雪 <literal>');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await expect(dialog.getByRole('option')).toContainText('Request 9:');
  await expect(dialog.getByRole('option')).not.toContainText('Buried needle');
  await search.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect
    .poll(() =>
      scroll.evaluate((node) => {
        const row = node.querySelector<HTMLElement>('[data-message-id="user-9"]');
        return row ? Math.abs(row.getBoundingClientRect().top - node.getBoundingClientRect().top - 12) : 999;
      }),
    )
    .toBeLessThan(2);
  await expect(composer).toHaveText('Keep my unsent draft.');
  expect(await chatRequests(desktopApp)).toEqual(before);
});

test('keyboard and page navigation reach first and last accepted turns while rendering a bounded option window', async ({
  desktopApp,
  page,
}) => {
  await installChatRefactorFixture(desktopApp, { initialMessages: history() });
  await page.reload();
  await page.locator('.messages').evaluate((node) => {
    node.scrollTop = 0;
  });
  const trigger = page.getByRole('button', { name: 'Jump to turn', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Jump to turn', exact: true });
  const search = dialog.getByRole('combobox');
  await search.press('ArrowDown');
  await search.press('Tab');
  await expect(dialog.getByRole('option').filter({ hasText: 'Request 1:' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(dialog.getByRole('option')).toHaveCount(12);
  await expect(dialog.getByRole('option').filter({ hasText: 'Request 91:' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(dialog.getByRole('option')).toHaveCount(80);
  await expect(dialog.getByRole('option').filter({ hasText: 'Request 0:' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.getByRole('option')).toHaveCount(12);
  await expect(dialog.getByRole('option').filter({ hasText: 'Request 80:' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(dialog.getByRole('option')).toHaveCount(80);
  await expect(dialog.getByRole('option').filter({ hasText: 'Request 0:' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('a streamed answer updates local search and a different conversation never inherits navigation state', async ({
  desktopApp,
  page,
}) => {
  await installChatRefactorFixture(desktopApp, { initialMessages: history() });
  await page.reload();
  const trigger = page.getByRole('button', { name: 'Jump to turn', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Jump to turn', exact: true });
  const search = dialog.getByRole('combobox');
  await search.fill('new streamed search phrase');
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await expect(dialog.getByText('No matching turns.', { exact: true })).toBeVisible();
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: true,
      message: {
        ...message('answer-91', 'assistant', ' New streamed search phrase.', 'turn-91'),
        streaming: true,
      },
    },
  });
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await expect(dialog.getByRole('option')).toContainText('Request 91:');
  await search.press('Escape');
  await page.locator('.chat-tabs').getByRole('button', { name: 'Titles · long form', exact: true }).click();
  await expect(trigger).toBeDisabled();
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-two',
      delta: false,
      message: message('other-user', 'user', 'An accepted request in the other conversation.', 'other-turn'),
    },
  });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expect(dialog.getByRole('combobox')).toHaveValue('');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await expect(dialog.getByRole('option')).toContainText('An accepted request in the other conversation.');
  await expect(dialog).not.toContainText('Request 91:');
  await expect(dialog.getByRole('status')).toHaveText('1 turn');
});
