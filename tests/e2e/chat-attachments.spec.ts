import { test, expect } from './development-fixtures';
import { chatControl, chatRequests, installChatFixture } from './chat-fixture';
import {
  feedbackControl,
  feedbackState,
  installFeedbackHolds,
  expectPending,
} from './loading-feedback-fixture';
import { installPicker } from './chat-attachments-fixture';

const files = ['/tmp/scene.png', '/tmp/narration.mp3'] satisfies [string, string];

test('attachments retain exact submitted files through delayed acknowledgement, failure and retry', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await installPicker(desktopApp, [files, [], [files[0]]]);
  await installFeedbackHolds(desktopApp, ['sendChat']);
  await page.reload();
  const attach = page.getByRole('button', { name: 'Attach files', exact: true });
  const badges = page.locator('.attachments .badge');
  const remove = badges.getByRole('button', { name: 'Remove', exact: true });
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  const send = page.getByRole('button', { name: 'Send message', exact: true });
  await attach.click();
  await expect(badges).toHaveText(['scene.png', 'narration.mp3']);
  await attach.click();
  await expect(badges).toHaveText(['scene.png', 'narration.mp3']);
  await remove.first().click();
  await expect(badges).toHaveText(['narration.mp3']);
  await attach.click();
  await expect(badges).toHaveText(['narration.mp3', 'scene.png']);
  await composer.fill('Use these two files');
  await send.click();
  await expectPending(send);
  await expect(attach).toBeDisabled();
  await expect(remove.first()).toBeDisabled();
  await expect(remove.last()).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Read only', exact: true })).toBeDisabled();
  expect((await feedbackState(desktopApp)).pending[0]?.args[0]).toMatchObject({
    sessionId: 'chat-one',
    text: 'Use these two files',
    attachments: [files[1], files[0]],
  });
  await feedbackControl(desktopApp, { finish: { method: 'sendChat', fail: true } });
  await expect(attach).toBeEnabled();
  await expect(remove.first()).toBeEnabled();
  await expect(composer).toHaveText('Use these two files');
  await expect(badges).toHaveText(['narration.mp3', 'scene.png']);
  await send.click();
  await expectPending(send);
  await feedbackControl(desktopApp, { finish: { method: 'sendChat' } });
  await expect(badges).toHaveCount(0);
  await expect(composer).toHaveText('');
  expect(await chatRequests(desktopApp)).toContainEqual(
    expect.objectContaining({ attachments: [files[1], files[0]] }),
  );
});

test('picker has local progress and prevents a send or duplicate picker until its result settles', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await installPicker(desktopApp, [files]);
  await installFeedbackHolds(desktopApp, ['chooseFiles']);
  await page.reload();
  const attach = page.getByRole('button', { name: 'Attach files', exact: true });
  const send = page.getByRole('button', { name: 'Send message', exact: true });
  await page.getByRole('textbox', { name: 'AI chat', exact: true }).fill('Wait for the selected files');
  await attach.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expectPending(attach);
  await expect(send).toBeDisabled();
  expect((await feedbackState(desktopApp)).pending).toHaveLength(1);
  await feedbackControl(desktopApp, { finish: { method: 'chooseFiles', fail: true } });
  await expect(attach).toBeEnabled();
  await expect(send).toBeEnabled();
  await attach.click();
  await expectPending(attach);
  await feedbackControl(desktopApp, { finish: { method: 'chooseFiles' } });
  await expect(page.locator('.attachments .badge')).toHaveText(['scene.png', 'narration.mp3']);
});

test('dirty edits and unrelated AI work lock existing attachment removal without losing selections', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await installPicker(desktopApp, [files]);
  await page.reload();
  const attach = page.getByRole('button', { name: 'Attach files', exact: true });
  const remove = page.locator('.attachments').getByRole('button', { name: 'Remove', exact: true });
  await attach.click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Uncommitted brand');
  await expect(attach).toBeDisabled();
  await expect(remove.first()).toBeDisabled();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Chat test brand');
  await expect(remove.first()).toBeEnabled();
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'other-helper', phase: 'working', detail: '' } },
  });
  await expect(attach).toBeDisabled();
  await expect(remove.first()).toBeDisabled();
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'other-helper', phase: 'done', detail: '' } },
  });
  await expect(remove.first()).toBeEnabled();
  await expect(page.locator('.attachments .badge')).toHaveText(['scene.png', 'narration.mp3']);
});
