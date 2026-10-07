import { test, expect } from './development-fixtures';
import {
  compactCalls,
  installChatUsageFixture,
  skillCalls,
  usageControl,
} from './chat-usage-refactor-fixture';
const usage = {
  context: null,
  account: { available: false, windows: [], checkedAt: '2026-10-07T18:00:00Z' },
};

test('cached slash drafts in hidden conversation slots never create portals or steal the visible command menu', async ({
  desktopApp,
  page,
}) => {
  await installChatUsageFixture(desktopApp, usage);
  await page.evaluate(() => {
    localStorage.setItem(
      'vandashi.draft.chat-two',
      JSON.stringify({
        text: '/read',
        seed: null,
        pending: null,
        mode: 'edit',
        collaboration: 'default',
        attachments: [],
      }),
    );
  });
  await page.reload();
  const menu = page.getByRole('listbox', { name: 'Commands', exact: true });
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveText('');
  await expect(menu).toHaveCount(0);
  await page.locator('.chat-tabs').getByRole('button', { name: 'Titles · long form', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveText('/read');
  await expect(menu).toHaveCount(1);
  await page.locator('.chat-tabs').getByRole('button', { name: 'Brand attributes', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveText('');
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  await expect(menu).toHaveCount(1);
  await expect(menu.getByRole('option').first()).toHaveText('/planPlan before editing');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('slash and enabled skill menus load above the composer, accept keyboard selection, and route compact through actual completion', async ({
  desktopApp,
  page,
}) => {
  await installChatUsageFixture(desktopApp, usage);
  await page.reload();
  await usageControl(desktopApp, { skillsHold: true });
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await editor.fill('/');
  const menu = page.getByRole('listbox', { name: 'Commands', exact: true });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Loading enabled Codex skills…');
  await usageControl(desktopApp, { skillsComplete: true });
  await expect(menu).toContainText('$hyperframes');
  await expect
    .poll(async () => {
      const popupRect = await menu.boundingBox();
      const composerRect = await page.locator('.composer:visible').boundingBox();
      return !!(popupRect && composerRect && popupRect.y + popupRect.height <= composerRect.y + 2);
    })
    .toBe(true);
  await editor.press('ArrowDown');
  await expect(editor).toHaveAttribute('aria-activedescendant', /command-1$/u);
  await editor.press('Enter');
  await expect(editor).toHaveText('');
  await expect(page.getByRole('combobox', { name: 'Read only', exact: true })).toBeVisible();
  await editor.fill('/skill:hyper');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await editor.press('Enter');
  await expect(editor).toHaveText('$hyperframes');
  await expect(menu).toHaveCount(0);
  await editor.fill('/plan');
  await editor.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Plan', exact: true })).toBeVisible();
  await editor.fill('/compact');
  await editor.press('Enter');
  await expect(editor).toHaveAttribute('aria-disabled', 'true');
  expect(await compactCalls(desktopApp)).toBe(1);
  await usageControl(desktopApp, { complete: true });
  await expect(editor).toHaveAttribute('aria-disabled', 'false');
  await expect(editor).toHaveText('');
  expect(await skillCalls(desktopApp)).toBeGreaterThan(1);
  await usageControl(desktopApp, { skillsFail: true });
  await editor.fill('/');
  await expect(menu).toContainText('Codex skills could not be loaded.');
  await expect(menu).not.toContainText('$hyperframes');
  await usageControl(desktopApp, { skillsFail: false });
  await menu.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(menu).toContainText('$hyperframes');
  await editor.focus();
  await editor.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(editor).toBeFocused();
});

test('stashing and reviewed restore preserve exact drafts, Plan mode and attachment selections without overwriting an occupied composer', async ({
  desktopApp,
  page,
}) => {
  await installChatUsageFixture(desktopApp, usage);
  await page.reload();
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await editor.fill('/plan');
  await editor.press('Enter');
  await editor.fill('Original exact draft\nwith another line');
  await page.getByRole('button', { name: 'Attach files', exact: true }).click();
  await expect(page.locator('.attachment')).toContainText('stashed.txt');
  const original = await page.evaluate(() => localStorage.getItem('vandashi.draft.chat-one'));
  await editor.press('Meta+s');
  await expect(editor).toHaveText('');
  const stash = page.getByRole('dialog', { name: 'Stash', exact: true });
  await expect(stash).toBeVisible();
  await expect(stash).toContainText('Original exact draft');
  await expect(page.locator('.attachment')).toHaveCount(0);
  await stash.getByRole('button', { name: 'Close', exact: true }).click();
  await editor.fill('/edit');
  await editor.press('Enter');
  await editor.fill('Current draft must survive');
  await page.getByRole('button', { name: 'Stash', exact: true }).click();
  await stash.getByRole('button', { name: 'Restore draft', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Restore draft', exact: true });
  await expect(review).toContainText('Your current draft will be saved in Stash');
  const lockedEditor = page.locator('.composer:visible [role="textbox"]');
  await expect(lockedEditor).toHaveText('Current draft must survive');
  await expect(lockedEditor).toHaveAttribute('aria-disabled', 'true');
  await expect(
    page
      .locator('.composer:visible')
      .getByRole('button', { name: 'Attach files', exact: true, includeHidden: true }),
  ).toBeDisabled();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveText('Current draft must survive');
  await page.getByRole('button', { name: 'Stash', exact: true }).click();
  await stash.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await review.getByRole('button', { name: 'Restore and stash current', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('vandashi.draft.chat-one')))
    .toBe(original);
  await expect(editor).toContainText('Original exact draft');
  await expect(editor).toContainText('with another line');
  await expect(page.getByRole('combobox', { name: 'Plan', exact: true })).toBeVisible();
  await expect(page.locator('.attachment')).toContainText('stashed.txt');
  await page.getByRole('button', { name: 'Stash', exact: true }).click();
  await expect(stash).toContainText('Current draft must survive');
  await expect(stash.getByRole('button', { name: 'Restore draft', exact: true })).toHaveCount(1);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('vandashi.draft.chat-one')))
    .toBe(original);
  await expect(editor).toContainText('Original exact draft');
  await expect(page.locator('.attachment')).toContainText('stashed.txt');
});
