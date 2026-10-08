import type { ModelInfo } from '../../src/domain/models';
import { test, expect } from './development-fixtures';
import { installChatUsageFixture, usageControl } from './chat-usage-refactor-fixture';
import { installFeedbackHolds, feedbackControl, feedbackState } from './loading-feedback-fixture';
import { cachedComposerText, leadingCommandCaret } from './chat-command-test-helpers';

const usage = {
  context: null,
  account: { available: false, windows: [], checkedAt: '2026-10-07T18:00:00Z' },
};
const models: ModelInfo[] = ['test-model', 'gpt-6.1-sol'].map((id) => ({
  id,
  name: id,
  description: '',
  reasoning: ['medium', 'high'],
  defaultReasoning: 'medium',
  fast: false,
  isDefault: id === 'test-model',
}));

test('model command opens the real picker with keyboard focus and retains Plan, exact draft and attachments through adoption', async ({
  desktopApp,
  page,
}, testInfo) => {
  await installChatUsageFixture(desktopApp, usage, models);
  await installFeedbackHolds(desktopApp, ['settings']);
  await page.reload();
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await editor.fill('/plan');
  await expect(page.getByRole('listbox', { name: 'Commands', exact: true }).getByRole('option')).toHaveCount(
    1,
  );
  await editor.press('Enter');
  await page.getByRole('button', { name: 'Attach files', exact: true }).click();
  await expect(page.locator('.attachment')).toContainText('stashed.txt');
  const attachmentMention = await page.evaluate(() => {
    const cached = JSON.parse(localStorage.getItem('vandashi.draft.chat-one') ?? '{}') as { text: string };
    return cached.text;
  });
  const remainder = 'Keep these exact lines\n\n  and spaces' + attachmentMention;
  await editor.fill('/model ' + remainder);
  await leadingCommandCaret(page, '/model');
  await expect(page.getByRole('listbox', { name: 'Commands', exact: true }).getByRole('option')).toHaveCount(
    1,
  );
  await editor.press('Enter');
  const menu = page.getByRole('listbox', { name: 'Model', exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('option', { name: 'test-model', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('model-command-picker.png') });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const cached = JSON.parse(localStorage.getItem('vandashi.draft.chat-one') ?? '{}') as {
          text: string;
        };
        return cached.text;
      }),
    )
    .toBe(' ' + remainder);
  await expect(page.locator('.attachment')).toContainText('stashed.txt');
  await page.screenshot({ path: testInfo.outputPath('final-composer.png') });
  await expect(page.getByRole('combobox', { name: 'Plan', exact: true })).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  const controls = page.locator('.composer-wrap:visible .model-controls-attached');
  await expect(controls).toHaveAttribute('aria-busy', 'true');
  await expect(controls.getByRole('combobox', { name: 'Model', exact: true })).toBeDisabled();
  expect((await feedbackState(desktopApp)).pending[0]?.args[0]).toMatchObject({
    chat: { model: 'gpt-6.1-sol', reasoning: 'medium', fast: false },
  });
  await feedbackControl(desktopApp, { finish: { method: 'settings' } });
  await expect(controls).toHaveAttribute('aria-busy', 'false');
  await expect(controls.getByRole('combobox', { name: 'Model', exact: true })).toHaveText('gpt-6.1-sol');
  await expect(page.getByRole('combobox', { name: 'Plan', exact: true })).toBeVisible();
  await expect(page.locator('.attachment')).toContainText('stashed.txt');
  await editor.fill('/model Another exact draft');
  await leadingCommandCaret(page, '/model');
  await expect(page.getByRole('listbox', { name: 'Commands', exact: true }).getByRole('option')).toHaveCount(
    1,
  );
  await editor.press('Enter');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(controls.getByRole('combobox', { name: 'Model', exact: true })).toBeFocused();
  await expect(editor).toHaveText(' Another exact draft');
  await expect.poll(() => cachedComposerText(page)).toBe(' Another exact draft');
});

test('model commands cannot bypass an active operation or leave a popup owned by a hidden conversation', async ({
  desktopApp,
  page,
}) => {
  await installChatUsageFixture(desktopApp, usage, models);
  await page.reload();
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await editor.fill('/model Keep this command until selection is allowed');
  await leadingCommandCaret(page, '/model');
  const commands = page.getByRole('listbox', { name: 'Commands', exact: true });
  await expect(commands.getByRole('option')).toHaveCount(1);
  await usageControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'chat-one', phase: 'working', detail: '' } },
  });
  await expect(commands.getByRole('option')).toBeDisabled();
  await editor.press('Enter');
  await expect(editor).toHaveText('/model Keep this command until selection is allowed');
  await expect
    .poll(() => cachedComposerText(page))
    .toBe('/model Keep this command until selection is allowed');
  await expect(page.getByRole('listbox', { name: 'Model', exact: true })).toHaveCount(0);
  await usageControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'chat-one', phase: 'done', detail: '' } },
  });
  await editor.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Model', exact: true })).toBeVisible();
  await page.locator('.chat-tabs').getByRole('button', { name: 'Titles · long form', exact: true }).click();
  await expect(page.getByRole('listbox', { name: 'Model', exact: true })).toHaveCount(0);
  await expect(editor).toHaveText('');
  await page.locator('.chat-tabs').getByRole('button', { name: 'Brand attributes', exact: true }).click();
  await expect(editor).toHaveText(' Keep this command until selection is allowed');
  await expect.poll(() => cachedComposerText(page)).toBe(' Keep this command until selection is allowed');
  await expect(page.getByRole('listbox', { name: 'Model', exact: true })).toHaveCount(0);
});
