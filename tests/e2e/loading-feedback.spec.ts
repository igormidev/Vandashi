import { test, expect } from './development-fixtures';
import { installChatFixture, chatControl } from './chat-fixture';
import { installModalOperationsFixture, finishModalOperation } from './modal-operations-fixture';
import { installAsyncEditorsFixture, asyncEditorControl, asyncEditorStatus } from './async-editors-fixture';
import {
  installFeedbackHolds,
  feedbackControl,
  feedbackState,
  expectPending,
} from './loading-feedback-fixture';
import { installCreationRefreshFixture, creationControl } from './creation-refresh-fixture';

test('brand creation shows progress, retains failure values and clears feedback after retry', async ({
  desktopApp,
  page,
}) => {
  await installModalOperationsFixture(desktopApp, true);
  await page.reload();
  await page.getByRole('button', { name: 'Create a brand', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const name = dialog.getByRole('textbox', { name: 'Brand name', exact: true });
  await name.fill('Pending studio');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expectPending(dialog.getByRole('button', { name: 'Loading…', exact: true }));
  await expect(name).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await finishModalOperation(desktopApp, 'failure');
  await expect(name).toHaveValue('Pending studio');
  await expect(dialog.locator('svg.spin')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Check again', exact: true }).click();
  await expectPending(dialog.getByRole('button', { name: 'Loading…', exact: true }));
  await finishModalOperation(desktopApp, 'success');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Pending studio');
});

for (const operation of ['resetChat', 'undoChat'] as const) {
  test(`${operation} shows owned progress without losing messages or drafts after failure`, async ({
    desktopApp,
    page,
  }) => {
    await installModalOperationsFixture(desktopApp);
    await page.reload();
    const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
    await composer.fill('Preserved draft');
    await page
      .getByRole('button', {
        name: operation === 'resetChat' ? 'Start a fresh conversation' : 'Revert last change',
        exact: true,
      })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await expectPending(dialog.getByRole('button', { name: 'Loading…', exact: true }));
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
    await finishModalOperation(desktopApp, 'failure');
    await expect(dialog.locator('svg.spin')).toHaveCount(0);
    await expect(page.getByText('Latest answer to remove', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(composer).toHaveText('Preserved draft');
  });
}

test('settings keeps progress through the refresh and preserves a rejected draft', async ({
  desktopApp,
  page,
}) => {
  await installAsyncEditorsFixture(desktopApp);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const field = dialog.locator('.field').filter({ hasText: 'Commit messages' });
  await field.getByRole('combobox', { name: 'Model', exact: true }).selectOption('test-model');
  const reasoning = field.getByRole('combobox', { name: 'Thinking', exact: true });
  await reasoning.selectOption('high');
  await asyncEditorControl(desktopApp, { holdSettings: true });
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expectPending(dialog.getByRole('button', { name: 'Loading…', exact: true }));
  await asyncEditorControl(desktopApp, { finishSettings: 'reject' });
  await expect(reasoning).toBeEnabled();
  await expect(reasoning).toHaveValue('high');
  await expect(dialog.locator('svg.spin')).toHaveCount(0);
  await asyncEditorControl(desktopApp, { holdModels: true });
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(async () => (await asyncEditorStatus(desktopApp)).pendingSettings).toBe(true);
  await asyncEditorControl(desktopApp, { finishSettings: 'resolve' });
  await expect.poll(async () => (await asyncEditorStatus(desktopApp)).pendingModels).toBe(1);
  await expectPending(dialog.getByRole('button', { name: 'Loading…', exact: true }));
  await asyncEditorControl(desktopApp, { finishModels: true });
  await expect(dialog).toBeHidden();
});

test('Studio discard displays progress until cleanup resolves and supports retry', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, true, { studioDirty: true, delayedDiscard: true });
  await page.reload();
  await page.getByRole('button', { name: 'Manual editing', exact: true }).click();
  await expect(page.locator('iframe.studio-frame')).toBeVisible();
  await page.getByRole('button', { name: 'Packaging', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expectPending(dialog.getByRole('button', { name: 'Loading…', exact: true }));
  await chatControl(desktopApp, { discard: 'failure' });
  await expect(dialog.locator('svg.spin')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expectPending(dialog.getByRole('button', { name: 'Loading…', exact: true }));
  await chatControl(desktopApp, { discard: 'success' });
  await expect(dialog).toBeHidden();
});

test('script handoff shows progress through acknowledgement while guidance stays locked', async ({
  desktopApp,
  page,
  rendererUrl,
}) => {
  await installCreationRefreshFixture(desktopApp, rendererUrl);
  await page.route('**/studio-test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Preview</title>' }),
  );
  await page.reload();
  await expect(
    page.locator('.chat-tabs').getByRole('button', { name: 'Creation workspace', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Video studio', exact: true })
    .getByRole('button', { name: 'Creation workspace', exact: true })
    .click();
  await expect(page.locator('.preview-stage svg.spin')).toBeVisible();
  await creationControl(desktopApp, { studio: true });
  const script = page.getByRole('textbox', { name: 'Script', exact: true });
  await expect(script).toBeEnabled();
  await script.fill('Revised opening scene');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const guidance = dialog.getByRole('textbox', { name: 'Direction for AI', exact: true });
  await guidance.fill('Keep this direction');
  await dialog.getByRole('button', { name: 'Save & create', exact: true }).click();
  await expectPending(dialog.getByRole('button', { name: 'Loading…', exact: true }));
  await expect(guidance).toBeDisabled();
  await creationControl(desktopApp, { acknowledge: true });
  await expect(dialog).toBeHidden();
  await creationControl(desktopApp, { complete: true });
});

test('opening a brand signals its row, prevents duplicate selection and clears a failure', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await page.reload();
  await page.getByRole('button', { name: 'Vandashi', exact: true }).click();
  await installFeedbackHolds(desktopApp, ['openBrand']);
  const brand = page.locator('.brand-row');
  await brand.click();
  await expectPending(brand);
  await expect(page.getByRole('button', { name: 'Create a brand', exact: true })).toBeDisabled();
  expect((await feedbackState(desktopApp)).pending).toHaveLength(1);
  await feedbackControl(desktopApp, { finish: { method: 'openBrand', fail: true } });
  await expect(brand).toBeEnabled();
  await expect(brand.locator('svg.spin')).toHaveCount(0);
  await brand.click();
  await expectPending(brand);
  await feedbackControl(desktopApp, { finish: { method: 'openBrand' } });
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Chat test brand');
});
