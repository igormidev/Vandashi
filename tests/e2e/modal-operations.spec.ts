import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  finishModalOperation,
  installModalOperationsFixture,
  modalOperationStatus,
  type ModalOperation,
} from './modal-operations-fixture';

async function expectPendingModal(
  desktop: ElectronApplication,
  page: Page,
  dialog: Locator,
  operation: ModalOperation,
) {
  await expect.poll(async () => (await modalOperationStatus(desktop)).pending).toBe(operation);
  await expect(dialog.getByRole('button', { name: 'Loading…', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).toBeVisible();
}

for (const operation of ['undoChat', 'resetChat'] as const) {
  test(`${operation} prevents repeated confirmation, preserves failure state, and completes on retry`, async ({
    desktopApp,
    page,
  }) => {
    await installModalOperationsFixture(desktopApp);
    await page.reload();
    await expect(page.getByText('Latest answer to remove', { exact: true })).toBeVisible();
    const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
    await composer.fill('Keep the unsent direction');
    await page
      .getByRole('button', {
        name: operation === 'undoChat' ? 'Revert last change' : 'Start a fresh conversation',
        exact: true,
      })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await expectPendingModal(desktopApp, page, dialog, operation);
    await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
    expect((await modalOperationStatus(desktopApp)).requests).toHaveLength(1);
    await finishModalOperation(desktopApp, 'failure');
    await expect(page.getByRole('status')).toContainText('The operation failed; please retry.');
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(composer).toHaveText('Keep the unsent direction');
    await expect(page.getByText('Latest answer to remove', { exact: true })).toBeVisible();
    await page
      .getByRole('button', {
        name: operation === 'undoChat' ? 'Revert last change' : 'Start a fresh conversation',
        exact: true,
      })
      .click();
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await expectPendingModal(desktopApp, page, dialog, operation);
    await finishModalOperation(desktopApp, 'success');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Latest answer to remove', { exact: true })).toHaveCount(0);
    if (operation === 'undoChat') {
      await expect(page.getByText('Earlier retained answer', { exact: true })).toBeVisible();
      await expect(composer).toHaveText('Keep the unsent direction');
      await expect(page.getByRole('button', { name: 'Revert last change', exact: true })).toBeDisabled();
    } else {
      await expect(page.getByText('Earlier retained answer', { exact: true })).toHaveCount(0);
      await expect(composer).toHaveText('');
    }
    expect((await modalOperationStatus(desktopApp)).requests).toEqual([
      { method: operation, input: 'chat-one' },
      { method: operation, input: 'chat-one' },
    ]);
    await page.getByRole('button', { name: 'Start a fresh conversation', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
}

test('brand creation locks its input and preserves its name after failure before a successful retry', async ({
  desktopApp,
  page,
}) => {
  await installModalOperationsFixture(desktopApp, true);
  await page.reload();
  await page.getByRole('button', { name: 'Create a brand', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a brand', exact: true });
  const name = dialog.getByRole('textbox', { name: 'Brand name', exact: true });
  await name.fill('Delayed Stories');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expectPendingModal(desktopApp, page, dialog, 'createBrand');
  await expect(name).toBeDisabled();
  await finishModalOperation(desktopApp, 'failure');
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue('Delayed Stories');
  await expect(dialog.getByRole('alert')).toContainText('The operation failed; please retry.');
  await dialog.getByRole('button', { name: 'Check again', exact: true }).click();
  await expectPendingModal(desktopApp, page, dialog, 'createBrand');
  await finishModalOperation(desktopApp, 'success');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Delayed Stories');
  expect((await modalOperationStatus(desktopApp)).requests).toEqual([
    { method: 'createBrand', input: { parentPath: '/tmp/modal-brand-parent', name: 'Delayed Stories' } },
    { method: 'createBrand', input: { parentPath: '/tmp/modal-brand-parent', name: 'Delayed Stories' } },
  ]);
});

test('video creation locks name and format through failure and retry', async ({ desktopApp, page }) => {
  await installModalOperationsFixture(desktopApp);
  await page.reload();
  await page.getByRole('button', { name: 'Videos', exact: true }).click();
  await page.getByRole('button', { name: 'New video', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New video', exact: true });
  const name = dialog.getByRole('textbox', { name: 'Project name', exact: true });
  const portrait = dialog.getByRole('button', { name: 'Portrait 9:16', exact: true });
  await name.fill('portrait-story');
  await portrait.click();
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expectPendingModal(desktopApp, page, dialog, 'createVideo');
  await expect(name).toBeDisabled();
  await expect(portrait).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Landscape 16:9', exact: true })).toBeDisabled();
  await finishModalOperation(desktopApp, 'failure');
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue('portrait-story');
  await expect(portrait).toHaveClass(/selected/u);
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expectPendingModal(desktopApp, page, dialog, 'createVideo');
  await finishModalOperation(desktopApp, 'success');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveValue('Short title');
  expect((await modalOperationStatus(desktopApp)).requests).toEqual([
    { method: 'createVideo', input: { brandId: 'chat-brand', name: 'portrait-story', ratio: '9:16' } },
    { method: 'createVideo', input: { brandId: 'chat-brand', name: 'portrait-story', ratio: '9:16' } },
  ]);
});
