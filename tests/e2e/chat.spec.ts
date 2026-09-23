import { expect } from '@playwright/test';
import { test } from './fixtures';
import { chatCalls, chatControl, installChatFixture } from './chat-fixture';

test('keeps the selected chat and both drafts through workspace and helper updates', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await page.reload();
  await expect(
    page
      .getByRole('button', { name: 'Launch suite', exact: true })
      .or(page.getByRole('heading', { name: 'Brand attributes', exact: true })),
  ).toBeVisible();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await expect(page.getByText('Saved conversation one', { exact: true })).toBeVisible();
  await composer.fill('Draft for the first chat');
  await page.locator('.chat-tabs').getByRole('button', { name: 'Titles · long form', exact: true }).click();
  await composer.fill('Keep this second draft');
  const sessionsBefore = (await chatCalls(desktopApp)).filter((call) => call === 'sessions').length;
  await chatControl(desktopApp, { reload: true });
  await expect(composer).toHaveText('Keep this second draft');
  await expect(page.getByText('Saved conversation two', { exact: true })).toBeVisible();
  expect((await chatCalls(desktopApp)).filter((call) => call === 'sessions').length).toBe(sessionsBefore);
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'commit-helper', phase: 'working', detail: '' } },
  });
  await expect(composer).toHaveAttribute('aria-disabled', 'true');
  await expect(composer).toHaveText('Keep this second draft');
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'other-helper', phase: 'done', detail: '' } },
  });
  await expect(composer).toHaveAttribute('aria-disabled', 'true');
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'commit-helper', phase: 'done', detail: '' } },
  });
  await expect(composer).toHaveAttribute('contenteditable', 'true');
  await expect(composer).toHaveText('Keep this second draft');
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'chat-two', phase: 'working', detail: '' } },
  });
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'chat-two', phase: 'done', detail: '' } },
  });
  await page.getByRole('button', { name: 'Brand attributes', exact: true }).click();
  await expect(composer).toHaveText('Draft for the first chat');
  expect((await chatCalls(desktopApp)).filter((call) => call === 'sessions').length).toBeGreaterThanOrEqual(
    sessionsBefore,
  );
  await page.getByRole('combobox', { name: 'Thinking', exact: true }).selectOption('high');
  await expect(page.getByRole('combobox', { name: 'Thinking', exact: true })).toHaveValue('high');
  await chatControl(desktopApp, { failSend: true });
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Quota exhausted');
  await expect(composer).toHaveText('Draft for the first chat');
});

test('refreshes a prepared publishing request without overwriting an edited draft', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, true);
  await page.reload();
  await expect(
    page
      .getByRole('button', { name: 'Launch suite', exact: true })
      .or(page.getByRole('heading', { name: 'Brand attributes', exact: true })),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Launch suite', exact: true }).click();
  await page
    .locator('.launch-row')
    .filter({ has: page.getByRole('heading', { name: 'YouTube', exact: true }) })
    .getByRole('button', { name: 'Prepare upload', exact: true })
    .click();
  await page.getByRole('button', { name: 'Open upload chat', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await expect(composer).toHaveText('Prepared upload request 1');
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Edit review', exact: true }).click();
  await expect(composer).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Titles', exact: true }).fill('Updated reviewed title');
  const tags = page.getByRole('textbox', { name: 'Tags', exact: true });
  await tags.pressSequentially('hidden city, blue hour, hidden city');
  await expect(tags).toHaveValue('hidden city, blue hour, hidden city');
  await tags.press('Tab');
  await expect(tags).toHaveValue('hidden city, blue hour');
  await page.getByRole('button', { name: 'Open upload chat', exact: true }).click();
  await expect(composer).toHaveText('Prepared upload request 2');
  await composer.fill('My reviewed publishing instructions');
  await page.getByRole('button', { name: 'Edit review', exact: true }).click();
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Updated description');
  await page.getByRole('button', { name: 'Open upload chat', exact: true }).click();
  await expect(composer).toHaveText('My reviewed publishing instructions');
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await composer.press('Enter');
  expect((await chatCalls(desktopApp)).filter((call) => call === 'sendChat')).toHaveLength(0);
  await page.locator('.chat-tab.active > button').first().click();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Keep my draft', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Packaging', exact: true }).click();
  await expect(composer).toHaveText('My reviewed publishing instructions');
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Keep my draft', exact: true }).click();
  await expect(composer).toHaveText('My reviewed publishing instructions');
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Launch suite', exact: true }).click();
  await page
    .locator('.launch-row')
    .filter({ has: page.getByRole('heading', { name: 'YouTube', exact: true }) })
    .getByRole('button', { name: 'Prepare upload', exact: true })
    .click();
  await page.getByRole('button', { name: 'Open upload chat', exact: true }).click();
  await page.getByRole('button', { name: 'Use prepared request', exact: true }).click();
  await expect(composer).toHaveText('Prepared upload request 4');
});
