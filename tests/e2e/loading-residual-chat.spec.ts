import { test, expect } from './development-fixtures';
import { installChatFixture, chatControl } from './chat-fixture';
import { installAsyncEditorsFixture, asyncEditorControl, asyncEditorStatus } from './async-editors-fixture';
import {
  installFeedbackHolds,
  feedbackControl,
  feedbackState,
  expectPending,
} from './loading-feedback-fixture';

test('session-list retry owns its wait, rejects duplicates and recovers after failure', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await installFeedbackHolds(desktopApp, ['sessions']);
  await page.reload();
  await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBeGreaterThan(0);
  await feedbackControl(desktopApp, { finish: { method: 'sessions', fail: true } });
  const retry = page.locator('.chat-retry').getByRole('button');
  await expect(retry).toHaveText('Check again');
  await retry.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expectPending(retry);
  await expect(page.locator('.chat-pane > .loading')).toBeVisible();
  await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBe(1);
  await feedbackControl(desktopApp, { finish: { method: 'sessions', fail: true } });
  await expect(retry).toBeEnabled();
  await expect(retry.locator('svg.spin')).toHaveCount(0);
  await retry.click();
  await expectPending(retry);
  await feedbackControl(desktopApp, { finish: { method: 'sessions' } });
  await expect(page.getByText('Saved conversation one', { exact: true })).toBeVisible();
  await expect(page.locator('.chat-retry')).toHaveCount(0);
});

test('background session refresh preserves the active chat and obsolete retry failure cannot replace recovery', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await page.reload();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.fill('Keep the conversation while it refreshes');
  await installFeedbackHolds(desktopApp, ['sessions']);
  const completed = {
    type: 'activity',
    activity: { sessionId: 'chat-one', phase: 'done', detail: '' },
  } as const;
  await chatControl(desktopApp, { event: completed });
  await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBe(1);
  await expect(page.getByText('Saved conversation one', { exact: true })).toBeVisible();
  await expect(composer).toBeEnabled();
  await expect(page.locator('.chat-pane > .loading')).toHaveCount(0);
  await feedbackControl(desktopApp, { finish: { method: 'sessions', fail: true } });
  await page.locator('.toast').getByRole('button', { name: 'Dismiss', exact: true }).click();
  await page.locator('.chat-retry').getByRole('button').click();
  await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBe(1);
  const first = (await feedbackState(desktopApp)).pending[0];
  if (!first) throw new Error('Missing explicit retry');
  await chatControl(desktopApp, { event: completed });
  await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBe(2);
  const second = (await feedbackState(desktopApp)).pending.find((entry) => entry.id !== first.id);
  if (!second) throw new Error('Missing newer refresh');
  await feedbackControl(desktopApp, { finish: { id: second.id } });
  await expect(page.locator('.chat-retry')).toHaveCount(0);
  await expect(page.locator('.chat-toolbar[role="status"] svg.spin')).toBeVisible();
  await feedbackControl(desktopApp, { finish: { id: first.id, fail: true } });
  await expect(page.locator('.chat-toolbar[role="status"]')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(composer).toHaveText('Keep the conversation while it refreshes');
});

test('closing a tab signals persistence, retains a failed draft, and queues a later reopen behind it', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await page.reload();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.fill('Draft survives closing and reopening');
  await installFeedbackHolds(desktopApp, ['closeChat', 'openChat']);
  const tab = page
    .locator('.chat-tab')
    .filter({ has: page.getByRole('button', { name: 'Brand attributes', exact: true }) });
  const close = tab.getByRole('button', { name: 'Close', exact: true });
  await close.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await page.mouse.move(8, 8);
  await expectPending(close);
  await expect(close).toHaveCSS('opacity', '1');
  await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBe(1);
  await feedbackControl(desktopApp, { finish: { method: 'closeChat', fail: true } });
  await expect(close).toBeEnabled();
  await expect(composer).toHaveText('Draft survives closing and reopening');
  await close.click();
  await expectPending(close);
  await page.getByRole('button', { name: 'Work on this with AI', exact: true }).first().click();
  await expect(page.locator('.chat-toolbar[role="status"] svg.spin')).toBeVisible();
  expect((await feedbackState(desktopApp)).pending.map((entry) => entry.method)).toEqual(['closeChat']);
  await feedbackControl(desktopApp, { finish: { method: 'closeChat' } });
  await expect
    .poll(async () => (await feedbackState(desktopApp)).pending.map((entry) => entry.method))
    .toEqual(['openChat']);
  await feedbackControl(desktopApp, { finish: { method: 'openChat' } });
  await expect(tab).toBeVisible();
  await expect(composer).toBeEnabled();
  await expect(composer).toHaveText('Draft survives closing and reopening');
  await expect(tab.locator('svg.spin')).toHaveCount(0);
});

test('concurrent tab closes adopt the remaining open selection regardless of response order', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await page.reload();
  await expect(page.locator('.chat-tab')).toHaveCount(2);
  await installFeedbackHolds(desktopApp, ['closeChat']);
  await page.locator('.chat-tabs').evaluate((element) => {
    element.querySelectorAll<HTMLButtonElement>('.close-tab').forEach((button) => {
      button.click();
    });
  });
  await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBe(2);
  const requests = (await feedbackState(desktopApp)).pending;
  const second = requests.find((entry) => entry.args[0] === 'chat-two');
  const first = requests.find((entry) => entry.args[0] === 'chat-one');
  if (!first || !second) throw new Error('Missing independently owned closes');
  await feedbackControl(desktopApp, { finish: { id: second.id } });
  await feedbackControl(desktopApp, { finish: { id: first.id } });
  await expect(page.locator('.chat-tab')).toHaveCount(0);
  await expect(page.locator('.chat-pane > .empty')).toBeVisible();
  await expect(page.locator('.chat-pane svg.spin')).toHaveCount(0);
});

test('model saving locks the selection and send through refresh, then offers retry without losing the draft', async ({
  desktopApp,
  page,
}) => {
  await installAsyncEditorsFixture(desktopApp);
  await page.reload();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.fill('Keep my unsent model-specific request');
  const controls = page.locator('.composer-wrap:visible > .model-controls');
  const reasoning = controls.getByRole('combobox', { name: 'Thinking', exact: true });
  await asyncEditorControl(desktopApp, { holdSettings: true });
  await reasoning.selectOption('high');
  await expect(controls).toHaveAttribute('aria-busy', 'true');
  await expect(controls.getByRole('status').locator('svg.spin')).toBeVisible();
  await expect(reasoning).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await asyncEditorControl(desktopApp, { finishSettings: 'reject' });
  await expect(reasoning).toBeEnabled();
  await expect(reasoning).toHaveValue('high');
  await expect(composer).toHaveText('Keep my unsent model-specific request');
  await asyncEditorControl(desktopApp, { holdModels: true });
  await controls.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect.poll(async () => (await asyncEditorStatus(desktopApp)).pendingSettings).toBe(true);
  await asyncEditorControl(desktopApp, { finishSettings: 'resolve' });
  await expect.poll(async () => (await asyncEditorStatus(desktopApp)).pendingModels).toBe(1);
  await expect(controls.getByRole('status').locator('svg.spin')).toBeVisible();
  await expect(reasoning).toBeDisabled();
  await asyncEditorControl(desktopApp, { finishModels: true });
  await expect(controls).toHaveAttribute('aria-busy', 'false');
  await expect(reasoning).toBeEnabled();
  await expect(controls.getByRole('button', { name: 'Check again', exact: true })).toHaveCount(0);
  expect((await asyncEditorStatus(desktopApp)).savedSettings.chat.reasoning).toBe('high');
});
