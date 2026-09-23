import { test, expect } from './fixtures';
import { chatCalls, chatControl, installChatFixture } from './chat-fixture';

test('failed dependency validation blocks every workspace tab and still permits home', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, true, { checksFail: true });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Check again', exact: true })).toBeVisible();
  for (const name of ['Packaging', 'Creation workspace', 'Manual editing', 'Assets', 'Clips', 'Launch suite'])
    await expect(page.getByRole('navigation').getByRole('button', { name, exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Vandashi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create a brand', exact: true })).toBeVisible();
});

test('Settings checks protect Studio edits and discard cannot be cancelled once started', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, true, { studioDirty: true, delayedDiscard: true });
  await page.reload();
  await page.getByRole('button', { name: 'Manual editing', exact: true }).click();
  await expect(page.locator('iframe.studio-frame')).toBeVisible();
  const initialChecks = (await chatCalls(desktopApp)).filter((method) => method === 'checks').length;
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Check installed tools', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('index.html');
  expect((await chatCalls(desktopApp)).filter((method) => method === 'checks')).toHaveLength(initialChecks);
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await chatControl(desktopApp, { discard: 'failure' });
  await expect(page.getByRole('status')).toContainText('Test restore failure');
  await expect(dialog.getByRole('button', { name: 'Discard changes', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await chatControl(desktopApp, { discard: 'success' });
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(async () => (await chatCalls(desktopApp)).filter((method) => method === 'checks').length)
    .toBe(initialChecks + 1);
  await expect(page.locator('iframe.studio-frame')).toBeVisible();
});
