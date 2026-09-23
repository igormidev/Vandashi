import { test, expect } from './fixtures';
import { chatCalls, chatControl, installChatFixture } from './chat-fixture';

test('hydrates only selected histories and a delayed answer preserves selection and both drafts', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, { delayedFirstOpen: true });
  await page.reload();
  const opens = async () => (await chatCalls(desktopApp)).filter((call) => call === 'openChat').length;
  await expect.poll(opens).toBe(1);
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.fill('First unsent draft');
  await page.locator('.chat-tabs').getByRole('button', { name: 'Titles · long form', exact: true }).click();
  await expect.poll(opens).toBe(2);
  await composer.fill('Second unsent draft');
  await chatControl(desktopApp, { open: true });
  await expect(page.getByText('Saved conversation two', { exact: true })).toBeVisible();
  await expect(composer).toHaveText('Second unsent draft');
  await page.getByRole('button', { name: 'Brand attributes', exact: true }).click();
  await expect(page.getByText('Recovered provider answer', { exact: true })).toBeVisible();
  await expect(composer).toHaveText('First unsent draft');
  expect(await opens()).toBe(2);
});

test('does not reopen a conversation closed while its provider history is loading', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, { delayedFirstOpen: true });
  await page.reload();
  await expect
    .poll(async () => (await chatCalls(desktopApp)).filter((call) => call === 'openChat').length)
    .toBe(1);
  await page
    .locator('.chat-tab')
    .filter({ has: page.getByRole('button', { name: 'Brand attributes', exact: true }) })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await chatControl(desktopApp, { open: true });
  await expect(page.getByRole('button', { name: 'Brand attributes', exact: true })).toHaveCount(0);
  await expect(page.getByText('Saved conversation two', { exact: true })).toBeVisible();
  await expect(page.getByText('Recovered provider answer', { exact: true })).toHaveCount(0);
});
