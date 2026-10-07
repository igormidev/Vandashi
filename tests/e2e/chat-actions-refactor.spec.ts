import { test, expect } from './development-fixtures';
import { installChatRefactorFixture } from './chat-refactor-fixture';
import { chatRequests } from './chat-fixture';
import type { ChatMessage } from '../../src/domain/models';

const message = (id: string, role: ChatMessage['role'], text: string): ChatMessage => ({
  id,
  role,
  text,
  turnId: id,
  createdAt: '2026-10-07T12:00:00Z',
  files: [],
  streaming: false,
});

test('prompt recall preserves manual drafts and quote inserts only selected assistant text in its own session', async ({
  desktopApp,
  page,
}) => {
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [
      message('one', 'user', 'First prompt'),
      message('two', 'user', 'Latest prompt'),
      message('answer', 'assistant', 'Selected words and unrelated words.'),
    ],
  });
  await page.reload();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.click();
  await composer.press('ArrowUp');
  await expect(composer).toHaveText('Latest prompt');
  await composer.press('ControlOrMeta+ArrowUp');
  await composer.press('ArrowUp');
  await expect(composer).toHaveText('First prompt');
  await composer.press('ControlOrMeta+ArrowDown');
  await composer.press('ArrowDown');
  await expect(composer).toHaveText('Latest prompt');
  await composer.press('ControlOrMeta+ArrowDown');
  await composer.press('ArrowDown');
  await expect(composer).toHaveText('');
  await composer.fill('Keep my draft');
  await composer.press('ControlOrMeta+ArrowUp');
  await composer.press('ArrowUp');
  await expect(composer).toHaveText('Keep my draft');
  const answer = page.locator('[data-message-id="answer"]');
  await answer.locator('.message-body p').evaluate((element) => {
    const node = element.firstChild;
    if (!node) throw new Error('Missing assistant text');
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 'Selected words'.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await answer.hover();
  await answer.getByRole('button', { name: 'Quote in reply', exact: true }).click();
  await expect(composer).toContainText('Keep my draft');
  await expect(composer).toContainText('> Selected words');
  await expect(composer).toContainText('[Source response](#chat-message-answer)');
  await expect(composer).not.toContainText('unrelated words');
  await expect(composer).toBeFocused();
  await expect(answer.locator('.message-time')).toBeVisible();
});

test('Plan selection survives reload and proposed plan actions prepare explicit read or edit requests', async ({
  desktopApp,
  page,
}) => {
  const plan = '# Save the guide\n\n1. Read the existing guide.\n2. Change the requested sentence.';
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [{ ...message('plan', 'assistant', plan), proposedPlan: true }],
  });
  await page.reload();
  const modes = page.locator('.composer-actions').getByRole('combobox');
  await modes.click();
  await page.getByRole('option', { name: 'Plan', exact: true }).click();
  await page.reload();
  await expect(modes).toContainText('Plan');
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.fill('Plan a change');
  await composer.press('Enter');
  await expect(composer).toHaveText('');
  expect(await chatRequests(desktopApp)).toContainEqual(
    expect.objectContaining({ mode: 'read', collaboration: 'plan', text: 'Plan a change' }),
  );
  const card = page.locator('[data-message-id="plan"]');
  await card.getByRole('button', { name: 'Revise', exact: true }).click();
  await expect(composer).toContainText('Revise this plan:');
  await expect(composer).toContainText('Read the existing guide.');
  await expect(modes).toContainText('Plan');
  await composer.press('ControlOrMeta+A');
  await composer.press('Backspace');
  await card.getByRole('button', { name: 'Implement', exact: true }).click();
  await expect(modes).toContainText('Allow edits');
  await expect(composer).toHaveText('');
  expect(await chatRequests(desktopApp)).toContainEqual(
    expect.objectContaining({
      mode: 'edit',
      collaboration: 'default',
      text: expect.stringContaining('Implement this plan:'),
    }),
  );
});
