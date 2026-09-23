import { test, expect } from './fixtures';
import { asyncEditorControl, asyncEditorStatus, installAsyncEditorsFixture } from './async-editors-fixture';

test.beforeEach(async ({ desktopApp, page }) => {
  await installAsyncEditorsFixture(desktopApp);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveValue('Test title');
});

test('locks editors until the newest refresh completes and ignores older responses after editing resumes', async ({
  desktopApp,
  page,
}) => {
  const title = page.getByRole('textbox', { name: 'Titles', exact: true });
  await asyncEditorControl(desktopApp, { holdWorkspaces: true, changedRevision: 'two' });
  await expect(title).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Creation workspace', exact: true })).toBeDisabled();
  await asyncEditorControl(desktopApp, { changedRevision: 'three' });
  await expect.poll(async () => (await asyncEditorStatus(desktopApp)).pendingWorkspaces).toEqual([1, 2]);
  await asyncEditorControl(desktopApp, { resolveWorkspace: 2 });
  await expect(title).toBeEnabled();
  await expect(title).toHaveValue('Server three');
  await title.fill('My newer manual draft');
  await asyncEditorControl(desktopApp, { resolveWorkspace: 1 });
  await expect.poll(async () => (await asyncEditorStatus(desktopApp)).pendingWorkspaces).toEqual([]);
  await expect(title).toHaveValue('My newer manual draft');
  await expect(page.getByRole('button', { name: 'Creation workspace', exact: true })).toBeDisabled();
});

test('preserves an existing draft across refresh and applies the changed workspace only after discard', async ({
  desktopApp,
  page,
}) => {
  const title = page.getByRole('textbox', { name: 'Titles', exact: true });
  await title.fill('Keep this unsaved title');
  await asyncEditorControl(desktopApp, { holdWorkspaces: true, changedRevision: 'two' });
  await expect(title).toBeDisabled();
  await expect.poll(async () => (await asyncEditorStatus(desktopApp)).pendingWorkspaces).toEqual([1]);
  await asyncEditorControl(desktopApp, { resolveWorkspace: 1 });
  await expect(title).toBeEnabled();
  await expect(title).toHaveValue('Keep this unsaved title');
  await expect(page.getByRole('button', { name: 'Creation workspace', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(title).toHaveValue('Server two');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Creation workspace', exact: true })).toBeEnabled();
});

test('unlocks the editor after a failed refresh without losing its draft', async ({ desktopApp, page }) => {
  const title = page.getByRole('textbox', { name: 'Titles', exact: true });
  await title.fill('Draft survives the read error');
  await asyncEditorControl(desktopApp, { holdWorkspaces: true, changedRevision: 'two' });
  await expect(title).toBeDisabled();
  await expect.poll(async () => (await asyncEditorStatus(desktopApp)).pendingWorkspaces).toEqual([1]);
  await asyncEditorControl(desktopApp, { rejectWorkspace: 1 });
  await expect(title).toBeEnabled();
  await expect(title).toHaveValue('Draft survives the read error');
  await expect(page.getByRole('status')).toContainText('Workspace read failed.');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
});

test('locks settings throughout save and refresh, preserves a failed draft, and allows a successful retry', async ({
  desktopApp,
  page,
}) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  const field = dialog.locator('.field').filter({ hasText: 'Commit messages' });
  await field.getByRole('combobox', { name: 'Model', exact: true }).selectOption('test-model');
  const reasoning = field.getByRole('combobox', { name: 'Thinking', exact: true });
  await reasoning.selectOption('high');
  await asyncEditorControl(desktopApp, { holdSettings: true });
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(async () => (await asyncEditorStatus(desktopApp)).pendingSettings).toBe(true);
  await expect(reasoning).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Check installed tools', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await asyncEditorControl(desktopApp, { finishSettings: 'reject' });
  await expect(reasoning).toBeEnabled();
  await expect(reasoning).toHaveValue('high');
  await expect(page.getByRole('status')).toContainText('Settings could not be saved.');
  await asyncEditorControl(desktopApp, { holdModels: true });
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(async () => (await asyncEditorStatus(desktopApp)).pendingSettings).toBe(true);
  await asyncEditorControl(desktopApp, { finishSettings: 'resolve' });
  await expect.poll(async () => (await asyncEditorStatus(desktopApp)).pendingModels).toBe(1);
  await expect(reasoning).toBeDisabled();
  await expect(dialog).toBeVisible();
  await asyncEditorControl(desktopApp, { finishModels: true });
  await expect(dialog).not.toBeVisible();
  expect((await asyncEditorStatus(desktopApp)).savedSettings.automation.reasoning).toBe('high');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(reasoning).toHaveValue('high');
});
