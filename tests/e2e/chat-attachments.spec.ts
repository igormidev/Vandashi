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
  const badges = page.locator('.composer .attachments .attachment');
  const remove = badges.getByRole('button', { name: 'Remove', exact: true });
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  const send = page.getByRole('button', { name: 'Send message', exact: true });
  await composer.fill('Use these two files');
  await attach.click();
  await expect(badges).toHaveText(['scene.png', 'narration.mp3']);
  await attach.click();
  await expect(badges).toHaveText(['scene.png', 'narration.mp3']);
  await remove.first().click();
  await expect(badges).toHaveText(['narration.mp3']);
  await attach.click();
  await expect(badges).toHaveText(['narration.mp3', 'scene.png']);
  const submitted =
    'Use these two files  @[narration.mp3](</tmp/narration.mp3>) @[scene.png](</tmp/scene.png>)';
  await send.click();
  await expectPending(send);
  await expect(attach).toBeDisabled();
  await expect(remove.first()).toBeDisabled();
  await expect(remove.last()).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Read only', exact: true })).toBeDisabled();
  expect((await feedbackState(desktopApp)).pending[0]?.args[0]).toMatchObject({
    sessionId: 'chat-one',
    text: submitted,
    attachments: [files[1], files[0]],
  });
  await feedbackControl(desktopApp, { finish: { method: 'sendChat', fail: true } });
  await expect(attach).toBeEnabled();
  await expect(remove.first()).toBeEnabled();
  await expect(composer).toContainText('Use these two files');
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
  await expect(page.locator('.composer .attachments .attachment')).toHaveText(['scene.png', 'narration.mp3']);
});

test('dirty edits and unrelated AI work lock existing attachment removal without losing selections', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await installPicker(desktopApp, [files]);
  await page.reload();
  const attach = page.getByRole('button', { name: 'Attach files', exact: true });
  const remove = page.locator('.composer .attachments').getByRole('button', { name: 'Remove', exact: true });
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
  await expect(page.locator('.settings-control')).toHaveCSS('color', 'rgb(240, 194, 90)');
  await expect(page.locator('.settings-control')).toBeDisabled();
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'other-helper', phase: 'done', detail: '' } },
  });
  await expect(remove.first()).toBeEnabled();
  await expect(page.locator('.composer .attachments .attachment')).toHaveText(['scene.png', 'narration.mp3']);
});

test('cached attachment selections survive closing and reopening their conversation', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await installPicker(desktopApp, [files]);
  await page.reload();
  await page.getByRole('textbox', { name: 'AI chat', exact: true }).fill('Retain my references');
  await page.getByRole('button', { name: 'Attach files', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Revert last change', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Increase text size', exact: true }).click();
  await expect(page.locator('.chat-pane')).toHaveCSS('--chat-font-size', '13px');
  await expect(page.locator('.composer .attachment')).toHaveCount(2);
  await page.locator('.chat-tab.active').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Work on this with AI', exact: true }).first().click();
  await expect(page.locator('.chat-scope')).toHaveText('Brand attributes');
  await expect(page.locator('.composer .attachment')).toHaveText(['scene.png', 'narration.mp3']);
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toContainText(
    'Retain my references',
  );
});

test('restoring a held queue entry locks the composer until failed removal or successful adoption', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await desktopApp.evaluate(({ ipcMain, BrowserWindow }) => {
    type Invoke = (event: Electron.IpcMainInvokeEvent, method: string, args: unknown[]) => unknown;
    const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Invoke> })._invokeHandlers.get(
      'vandashi:invoke',
    );
    if (!invoke) throw new Error('Missing fixture handler');
    const entry = {
      id: 'held',
      failed: true,
      request: {
        sessionId: 'chat-one',
        text: 'Held @[scene.png](</tmp/scene.png>)',
        mode: 'read',
        attachments: ['/tmp/scene.png'],
        selection: { model: 'test-model', reasoning: 'medium', speed: 'standard' },
      },
    };
    let entries = [entry];
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (event, method: string, args: unknown[]) => {
      if (method === 'queuedChats') return structuredClone(entries);
      if (method === 'removeQueuedChat') {
        entries = [];
        BrowserWindow.getAllWindows()[0]?.webContents.send('vandashi:event', {
          type: 'chat-queue',
          sessionId: 'chat-one',
          entries,
        });
        return;
      }
      return invoke(event, method, args);
    });
  });
  await installFeedbackHolds(desktopApp, ['removeQueuedChat']);
  await page.reload();
  const restore = page.getByRole('button', { name: 'Restore draft', exact: true });
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await restore.click();
  await expect(composer).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Attach files', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Read only', exact: true })).toBeDisabled();
  await feedbackControl(desktopApp, { finish: { method: 'removeQueuedChat', fail: true } });
  await expect(composer).toBeEnabled();
  await expect(composer).toHaveText('');
  await expect(restore).toBeEnabled();
  await restore.click();
  await feedbackControl(desktopApp, { finish: { method: 'removeQueuedChat' } });
  await expect(composer).toContainText('Held');
  await expect(page.locator('.composer .attachment')).toHaveText(['scene.png']);
  await expect(restore).toHaveCount(0);
});
