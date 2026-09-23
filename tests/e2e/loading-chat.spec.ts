import { test, expect } from './development-fixtures';
import { installChatFixture, chatControl, chatRequests } from './chat-fixture';
import {
  installFeedbackHolds,
  feedbackControl,
  feedbackState,
  expectPending,
} from './loading-feedback-fixture';

test('rapid AI context requests retain drafts, lock sending and ignore the obsolete failure', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, { references: true });
  await page.reload();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.fill('Brand draft remains here');
  await installFeedbackHolds(desktopApp, ['openChat']);
  const ai = page.getByRole('button', { name: 'Work on this with AI', exact: true });
  await ai.first().click();
  await expect(page.locator('.chat-toolbar[role="status"] svg.spin')).toBeVisible();
  await expect(composer).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  const first = (await feedbackState(desktopApp)).pending[0];
  if (!first) throw new Error('Missing first context request');
  await page.locator('.chip-scroll').getByRole('button', { name: 'Titles · long form', exact: true }).click();
  await ai.last().click();
  await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBe(2);
  const second = (await feedbackState(desktopApp)).pending.find((entry) => entry.id !== first.id);
  if (!second) throw new Error('Missing newer context request');
  await feedbackControl(desktopApp, { finish: { id: second.id } });
  await expect(page.getByText('Saved conversation two', { exact: true })).toBeVisible();
  await expect(composer).toBeEnabled();
  await composer.fill('Title draft remains selected');
  await feedbackControl(desktopApp, { finish: { id: first.id, fail: true } });
  await expect(page.locator('.chat-toolbar[role="status"]')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(composer).toHaveText('Title draft remains selected');
  await page.locator('.chat-tabs').getByRole('button', { name: 'Brand attributes', exact: true }).click();
  await expect(composer).toHaveText('Brand draft remains here');
  expect(await chatRequests(desktopApp)).toEqual([]);
});

test('current context failure clears progress and a successful retry adopts only that conversation', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, { references: true });
  await page.reload();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.fill('Still unsent');
  await installFeedbackHolds(desktopApp, ['openChat']);
  await page.locator('.chip-scroll').getByRole('button', { name: 'Titles · long form', exact: true }).click();
  await page.getByRole('button', { name: 'Work on this with AI', exact: true }).last().click();
  await expect(composer).toBeDisabled();
  await feedbackControl(desktopApp, { finish: { method: 'openChat', fail: true } });
  await expect(page.locator('.chat-toolbar[role="status"]')).toHaveCount(0);
  await expect(composer).toHaveText('Still unsent');
  await page.locator('.chat-retry').getByRole('button', { name: 'Check again', exact: true }).click();
  await expectPending(page.locator('.chat-retry').getByRole('button', { name: 'Loading…', exact: true }));
  await feedbackControl(desktopApp, { finish: { method: 'openChat' } });
  await expect(page.getByText('Saved conversation two', { exact: true })).toBeVisible();
  await expect(composer).toBeEnabled();
  await expect(page.locator('.chat-retry')).toHaveCount(0);
});

test('send acknowledgement and stop cleanup expose separate busy indicators and restore failed drafts', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await page.reload();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.fill('Keep this until accepted');
  await installFeedbackHolds(desktopApp, ['sendChat', 'cancelChat']);
  const send = page.getByRole('button', { name: 'Send message', exact: true });
  await send.click();
  await expectPending(send);
  await feedbackControl(desktopApp, { finish: { method: 'sendChat', fail: true } });
  await expect(send).toBeEnabled();
  await expect(send.locator('svg.spin')).toHaveCount(0);
  await expect(composer).toHaveText('Keep this until accepted');
  await send.click();
  await expectPending(send);
  await feedbackControl(desktopApp, { finish: { method: 'sendChat' } });
  await expect(composer).toHaveText('');
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'chat-one', phase: 'working', detail: '' } },
  });
  const stop = page.getByRole('button', { name: 'Stop', exact: true });
  await stop.click();
  await expectPending(stop);
  expect(
    (await feedbackState(desktopApp)).pending.filter((entry) => entry.method === 'cancelChat'),
  ).toHaveLength(1);
  await feedbackControl(desktopApp, { finish: { method: 'cancelChat', fail: true } });
  await expect(stop).toBeEnabled();
  await expect(stop.locator('svg.spin')).toHaveCount(0);
  await stop.click();
  await expectPending(stop);
  await feedbackControl(desktopApp, { finish: { method: 'cancelChat' } });
  await expect(stop).toBeHidden();
  await expect(composer).toBeEnabled();
});
