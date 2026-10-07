import { test, expect } from './development-fixtures';
import { installChatRefactorFixture } from './chat-refactor-fixture';
import { chatRequests } from './chat-fixture';

test('a successful rewind adopts its exact Plan draft before failed refresh and retries only the read', async ({
  desktopApp,
  page,
}) => {
  const text = 'Original Plan draft with exact guidance';
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [
      { id: 'old-user', role: 'user', text, turnId: 'old-turn', createdAt: '', files: [] },
      {
        id: 'old-answer',
        role: 'assistant',
        text: 'Later answer',
        turnId: 'old-turn',
        createdAt: '',
        files: [],
      },
    ],
    historyRewind: { text, failRefreshOnce: true },
  });
  await page.reload();
  const user = page.locator('[data-message-id="old-user"]');
  await user.hover();
  await user.getByRole('button', { name: 'Edit from here', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Edit from here', exact: true }).click();
  // Radix intentionally hides the underlying chat from assistive technology while
  // the owned recovery dialog remains open. Inspect the retained draft in its DOM.
  const composer = page.locator('.chat-composer-slot:not([hidden]) [role="textbox"]');
  await expect(composer).toHaveText(text);
  await expect(composer).toHaveAttribute('aria-disabled', 'true');
  await expect(user).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(composer).toHaveText(text);
  await expect(composer).toHaveAttribute('contenteditable', 'true');
  await expect(page.locator('.composer-actions').getByRole('combobox')).toContainText('Plan');
  const requests = (await chatRequests(desktopApp)) as { method?: string }[];
  expect(requests.filter((entry) => entry.method === 'rewindChat')).toHaveLength(1);
  expect(requests.filter((entry) => entry.method === 'openWorkspace')).toHaveLength(2);
});
