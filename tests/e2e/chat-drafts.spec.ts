import { test, expect } from './fixtures';
import { installChatFixture } from './chat-fixture';

test('restores the selected conversation, unsent text, and read-only mode after reopening the renderer', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await page.reload();
  await page.locator('.chat-tabs').getByRole('button', { name: 'Titles · long form', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.fill('Keep my unsent idea after reopening the app.');
  await page.getByRole('combobox', { name: 'Read only', exact: true }).selectOption('read');
  await page.reload();
  await expect(page.getByText('Saved conversation two', { exact: true })).toBeVisible();
  await expect(composer).toHaveText('Keep my unsent idea after reopening the app.');
  await expect(page.getByRole('combobox', { name: 'Read only', exact: true })).toHaveValue('read');
  await page.getByRole('button', { name: 'Brand attributes', exact: true }).click();
  await expect(composer).toHaveText('');
  await page.locator('.chat-tabs').getByRole('button', { name: 'Titles · long form', exact: true }).click();
  await expect(composer).toHaveText('Keep my unsent idea after reopening the app.');
});
