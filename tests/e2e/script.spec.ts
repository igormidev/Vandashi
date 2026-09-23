import { test, expect } from './fixtures';
import { installChatFixture } from './chat-fixture';

test('keeps script changes in memory and makes reset undoable without unlocking conflicting work', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, true);
  await page.reload();
  await page.getByRole('button', { name: 'Creation workspace', exact: true }).click();
  const script = page.getByRole('textbox', { name: 'Script', exact: true });
  const text = '# 東京の物語\n\nA quiet opening, then a warm title.\n';
  await script.fill(text);
  await expect(page.getByRole('button', { name: 'Packaging', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'AI chat', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Render video', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'View changes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Changes', exact: true })).toContainText('+# 東京の物語');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(script).toHaveValue(text);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(script).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(script).toHaveValue(text);
  await expect(page.getByRole('button', { name: 'Packaging', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(script).toHaveValue('');
  await page.getByRole('button', { name: 'Increase text size', exact: true }).click();
  await expect(script).toHaveCSS('font-size', '13px');
});
