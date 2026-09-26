import type { ElectronApplication, Page } from '@playwright/test';
import type { IpcMainInvokeEvent } from 'electron';
import { test, expect } from './development-fixtures';
import { installChatFixture, chatRequests } from './chat-fixture';
import { installFeedbackHolds, feedbackControl, feedbackState } from './loading-feedback-fixture';

async function installModels(desktop: ElectronApplication) {
  await installChatFixture(desktop);
  await desktop.evaluate(({ ipcMain }) => {
    type Invoke = (event: IpcMainInvokeEvent, method: string, args: unknown[]) => unknown;
    const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Invoke> })._invokeHandlers.get(
      'vandashi:invoke',
    );
    if (!invoke) throw new Error('Missing chat fixture');
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (event, method: string, args: unknown[]) =>
      method === 'models'
        ? ['test-model', 'alternate-model'].map((id) => ({
            id,
            name: id,
            description: '',
            reasoning: ['low', 'high'],
            defaultReasoning: id === 'test-model' ? 'low' : 'high',
            fast: true,
            isDefault: id === 'test-model',
          }))
        : invoke(event, method, args),
    );
  });
}

const controls = (page: Page) => page.locator('.composer-wrap:visible > .model-controls');
const model = (page: Page) => controls(page).getByRole('combobox', { name: 'Model', exact: true });
const chat = (page: Page, name: string) =>
  page.locator('.chat-tab').getByRole('button', { name, exact: true });

async function finishSave(desktop: ElectronApplication, failRefresh?: string) {
  await expect
    .poll(async () => (await feedbackState(desktop)).pending.some((request) => request.method === 'settings'))
    .toBe(true);
  await feedbackControl(desktop, { finish: { method: 'settings' } });
  await expect
    .poll(async () => (await feedbackState(desktop)).pending.some((request) => request.method === 'models'))
    .toBe(true);
  await feedbackControl(desktop, { finish: { method: 'getState', fail: failRefresh === 'getState' } });
  await feedbackControl(desktop, { finish: { method: 'models', fail: failRefresh === 'models' } });
}

test('settled chat selections follow the latest preference from another mounted chat and Settings', async ({
  desktopApp,
  page,
}) => {
  await installModels(desktopApp);
  await page.reload();
  await expect(model(page)).toHaveValue('test-model');
  await installFeedbackHolds(desktopApp, ['settings', 'getState', 'models']);
  await model(page).selectOption('alternate-model');
  await expect(controls(page)).toHaveAttribute('aria-busy', 'true');
  await finishSave(desktopApp);
  await expect(controls(page)).toHaveAttribute('aria-busy', 'false');
  await chat(page, 'Titles · long form').click();
  await expect(model(page)).toHaveValue('alternate-model');
  await model(page).selectOption('test-model');
  await finishSave(desktopApp);
  await expect(controls(page)).toHaveAttribute('aria-busy', 'false');
  await chat(page, 'Brand attributes').click();
  await expect(model(page)).toHaveValue('test-model');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  const preference = dialog.locator('.model-controls').first();
  await preference.getByRole('combobox', { name: 'Model', exact: true }).selectOption('alternate-model');
  await preference.getByRole('combobox', { name: 'Thinking', exact: true }).selectOption('low');
  await preference.locator('button[aria-pressed]').click();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Loading…', exact: true })).toBeDisabled();
  await finishSave(desktopApp);
  await expect(dialog).toHaveCount(0);
  for (const name of ['Brand attributes', 'Titles · long form']) {
    await chat(page, name).click();
    await expect(model(page)).toHaveValue('alternate-model');
    await expect(controls(page).getByRole('combobox', { name: 'Thinking', exact: true })).toHaveValue('low');
    await expect(controls(page).locator('button[aria-pressed]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('textbox', { name: 'AI chat', exact: true }).fill(`Latest preference in ${name}`);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
  }
  const sent = (await chatRequests(desktopApp)).filter(
    (request): request is { selection: unknown } =>
      !!request && typeof request === 'object' && 'selection' in request,
  );
  expect(sent.map((request) => request.selection)).toEqual([
    { model: 'alternate-model', reasoning: 'low', fast: true },
    { model: 'alternate-model', reasoning: 'low', fast: true },
  ]);
});

for (const failed of ['getState', 'models']) {
  test(`Settings retains its reviewed draft after failed ${failed} adoption and locks the successful retry`, async ({
    desktopApp,
    page,
  }) => {
    await installModels(desktopApp);
    await page.reload();
    await expect(model(page)).toHaveValue('test-model');
    await page.getByRole('textbox', { name: 'AI chat', exact: true }).fill('Send after adopting Settings');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
    const preference = dialog.locator('.model-controls').first();
    const selectedModel = preference.getByRole('combobox', { name: 'Model', exact: true });
    const selectedReasoning = preference.getByRole('combobox', { name: 'Thinking', exact: true });
    const selectedSpeed = preference.locator('button[aria-pressed]');
    await selectedModel.selectOption('alternate-model');
    await selectedReasoning.selectOption('low');
    await selectedSpeed.click();
    await installFeedbackHolds(desktopApp, ['settings', 'getState', 'models']);
    const save = dialog.locator('.modal-actions > button.primary');
    await save.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(save).toHaveAttribute('aria-busy', 'true');
    await expect(save.locator('svg.spin')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
    await expect(selectedModel).toBeDisabled();
    await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBe(1);
    await finishSave(desktopApp, failed);
    await expect(dialog).toBeVisible();
    await expect(save).toHaveText('Save changes');
    await expect(save).toBeEnabled();
    await expect(save).toHaveAttribute('aria-busy', 'false');
    await expect(selectedModel).toHaveValue('alternate-model');
    await expect(selectedReasoning).toHaveValue('low');
    await expect(selectedSpeed).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Send message', exact: true })).toHaveCount(0);
    expect(await chatRequests(desktopApp)).toHaveLength(1);

    await save.click();
    await expect(save).toHaveAttribute('aria-busy', 'true');
    await expect(selectedModel).toBeDisabled();
    await expect
      .poll(async () => (await feedbackState(desktopApp)).pending.map((request) => request.method))
      .toEqual(['settings']);
    await feedbackControl(desktopApp, { finish: { method: 'settings' } });
    await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBe(2);
    await feedbackControl(desktopApp, { finish: { method: 'getState' } });
    await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBe(1);
    await expect(save.locator('svg.spin')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await feedbackControl(desktopApp, { finish: { method: 'models' } });
    await expect(dialog).toHaveCount(0);
    await expect(model(page)).toHaveValue('alternate-model');
    await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveText(
      'Send after adopting Settings',
    );
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    expect((await chatRequests(desktopApp)).at(-1)).toMatchObject({
      sessionId: 'chat-one',
      text: 'Send after adopting Settings',
      selection: { model: 'alternate-model', reasoning: 'low', fast: true },
    });
  });

  test(`failed ${failed} adoption keeps the owned choice for retry, then releases it to later global preferences`, async ({
    desktopApp,
    page,
  }) => {
    await installModels(desktopApp);
    await page.reload();
    await expect(model(page)).toHaveValue('test-model');
    await page.getByRole('textbox', { name: 'AI chat', exact: true }).fill('Preserve my retry draft');
    await installFeedbackHolds(desktopApp, ['settings', 'getState', 'models']);
    await model(page).selectOption('alternate-model');
    await finishSave(desktopApp, failed);
    await expect(controls(page)).toHaveAttribute('aria-busy', 'false');
    await expect(model(page)).toHaveValue('alternate-model');
    await expect(controls(page).getByRole('button', { name: 'Check again', exact: true })).toBeEnabled();
    await chat(page, 'Titles · long form').click();
    await model(page).selectOption('test-model');
    await finishSave(desktopApp);
    await expect(controls(page)).toHaveAttribute('aria-busy', 'false');
    await chat(page, 'Brand attributes').click();
    await expect(model(page)).toHaveValue('alternate-model');
    await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveText(
      'Preserve my retry draft',
    );
    await controls(page).getByRole('button', { name: 'Check again', exact: true }).click();
    await expect(controls(page)).toHaveAttribute('aria-busy', 'true');
    await finishSave(desktopApp);
    await expect(controls(page)).toHaveAttribute('aria-busy', 'false');
    await expect(controls(page).getByRole('button', { name: 'Check again', exact: true })).toHaveCount(0);
    await chat(page, 'Titles · long form').click();
    await expect(model(page)).toHaveValue('alternate-model');
    await model(page).selectOption('test-model');
    await finishSave(desktopApp);
    await expect(controls(page)).toHaveAttribute('aria-busy', 'false');
    await chat(page, 'Brand attributes').click();
    await expect(model(page)).toHaveValue('test-model');
  });
}
