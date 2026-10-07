import type { ModelInfo } from '../../src/domain/models';
import { test, expect } from './development-fixtures';
import { chatControl, chatRequests, installChatFixture } from './chat-fixture';
import { installPicker } from './chat-attachments-fixture';
import { feedbackControl, feedbackState, installFeedbackHolds } from './loading-feedback-fixture';

const reasoning = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const models: ModelInfo[] = (
  [
    ['test-model', 'Current model'],
    ['gpt-6.1-sol', 'GPT-6.1-Sol'],
    ['gpt-6-terra', 'GPT-6-Terra'],
    ['gpt-6-luna', 'GPT-6-Luna'],
    ['gpt-6-astra', 'GPT-6-Astra'],
    ['gpt-7-future', 'GPT-7-Future'],
  ] as const
).map(([id, name]) => ({
  id,
  name,
  description: '',
  reasoning,
  defaultReasoning: 'medium',
  fast: id !== 'gpt-7-future',
  isDefault: id === 'test-model',
}));

test('composer choices show every live option above the trigger and retain keyboard selection and future-model fallback', async ({
  desktopApp,
  page,
}, testInfo) => {
  await installChatFixture(desktopApp, false, { models });
  await page.reload();
  await desktopApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1200, 720);
  });
  const controls = page.locator('.composer-wrap:visible > .model-controls-attached');
  const model = controls.getByRole('combobox', { name: 'Model', exact: true });
  const effort = controls.getByRole('combobox', { name: 'Thinking', exact: true });
  await expect(model).toHaveText('Current model');
  const fast = controls.getByRole('button', { pressed: false });
  await fast.click();
  await expect(controls.getByRole('button', { pressed: true })).toBeVisible();
  await model.click();
  const menu = page.getByRole('listbox', { name: 'Model', exact: true });
  await expect(menu.getByRole('option')).toHaveCount(6);
  for (const [name, icon] of [
    ['GPT-6.1-Sol', 'sun'],
    ['GPT-6-Terra', 'earth'],
    ['GPT-6-Luna', 'moon'],
    ['GPT-6-Astra', 'star'],
    ['GPT-7-Future', 'cpu'],
  ] as const)
    await expect(menu.getByRole('option', { name, exact: true }).locator(`svg.lucide-${icon}`)).toBeVisible();
  const modelBox = await model.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(modelBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThan(modelBox?.y ?? 0);
  expect(await menu.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('model-menu.png') });
  await page.keyboard.press('End');
  await expect(menu.getByRole('option', { name: 'GPT-7-Future', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(model).toHaveText('GPT-7-Future');
  await expect(controls).toHaveAttribute('aria-busy', 'false');
  await expect(model.locator('svg.lucide-cpu')).toBeVisible();
  await expect(controls.getByRole('button', { pressed: false })).toBeDisabled();

  await effort.press('ArrowUp');
  const efforts = page.getByRole('listbox', { name: 'Thinking', exact: true });
  await expect(efforts.getByRole('option')).toHaveCount(8);
  await expect(efforts.getByRole('option').locator('svg.selection-icon')).toHaveCount(8);
  expect(await efforts.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(effort).toHaveText('Ultra');
  await expect(controls).toHaveAttribute('aria-busy', 'false');
  await effort.click();
  await page.keyboard.press('Escape');
  await expect(efforts).toHaveCount(0);
  await expect(effort).toBeFocused();
  await model.click();
  await page.locator('.chat-scope').click();
  await expect(menu).toHaveCount(0);
  await page.getByRole('textbox', { name: 'AI chat', exact: true }).fill('Send the exact live choices');
  await page.screenshot({ path: testInfo.outputPath('composer.png') });
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  expect((await chatRequests(desktopApp)).at(-1)).toMatchObject({
    selection: { model: 'gpt-7-future', reasoning: 'ultra', fast: false },
  });
});

test('mode and attachment actions stay locked through picker settlement and send failure with the exact draft retained', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, { models });
  await installPicker(desktopApp, [['/tmp/scene.png']]);
  await installFeedbackHolds(desktopApp, ['chooseFiles', 'sendChat']);
  await page.reload();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  const mode = page.locator('.composer-wrap:visible .mode-choice[role="combobox"]');
  const attach = page.getByRole('button', { name: 'Attach files', exact: true });
  const send = page.getByRole('button', { name: 'Send message', exact: true });
  await composer.fill('Keep the reviewed draft and selected files');
  await mode.click();
  const modes = page.getByRole('listbox', { name: 'Allow edits', exact: true });
  await expect(modes.getByRole('option', { name: 'Read only', exact: true }).locator('svg')).toBeVisible();
  await modes.getByRole('option', { name: 'Read only', exact: true }).click();
  await expect(mode).toHaveText('Read only');
  await expect(mode.locator('svg.lucide-eye')).toBeVisible();
  expect(await attach.evaluate((element) => element.nextElementSibling?.getAttribute('aria-label'))).toBe(
    'Send message',
  );
  await attach.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(attach).toHaveAttribute('aria-busy', 'true');
  await expect(attach.locator('svg.spin')).toBeVisible();
  await expect(mode).toBeDisabled();
  await expect(send).toBeDisabled();
  expect((await feedbackState(desktopApp)).pending).toHaveLength(1);
  await feedbackControl(desktopApp, { finish: { method: 'chooseFiles' } });
  await expect(attach).toBeEnabled();
  await expect(page.locator('.composer:visible .attachment')).toHaveText(['scene.png']);
  await send.click();
  await expect(mode).toBeDisabled();
  await expect(attach).toBeDisabled();
  expect((await feedbackState(desktopApp)).pending[0]?.args[0]).toMatchObject({
    mode: 'read',
    text: 'Keep the reviewed draft and selected files @[scene.png](</tmp/scene.png>)',
    attachments: ['/tmp/scene.png'],
  });
  await feedbackControl(desktopApp, { finish: { method: 'sendChat', fail: true } });
  await expect(mode).toBeEnabled();
  await expect(mode).toHaveText('Read only');
  await expect(composer).toContainText('Keep the reviewed draft and selected files');
  await expect(page.locator('.composer:visible .attachment')).toHaveText(['scene.png']);

  await mode.click();
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'other-helper', phase: 'working', detail: '' } },
  });
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(mode).toBeDisabled();
  await expect(composer).toContainText('Keep the reviewed draft and selected files');
});

test('attached composer controls do not change the separate Settings model preferences', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, { models });
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const choices = settings.locator('.model-controls');
  await expect(choices).toHaveCount(5);
  await expect(settings.locator('.model-controls-attached')).toHaveCount(0);
  await expect(choices.getByRole('combobox', { name: 'Model', exact: true })).toHaveCount(5);
  const selected = choices.first();
  await selected.getByRole('combobox', { name: 'Model', exact: true }).selectOption('gpt-6-luna');
  await selected.getByRole('combobox', { name: 'Thinking', exact: true }).selectOption('high');
  await settings.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(
    page.locator('.composer-wrap:visible').getByRole('combobox', { name: 'Model', exact: true }),
  ).toHaveText('GPT-6-Luna');
  await expect(
    page.locator('.composer-wrap:visible').getByRole('combobox', { name: 'Thinking', exact: true }),
  ).toHaveText('High');
});
