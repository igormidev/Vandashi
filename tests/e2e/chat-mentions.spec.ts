import { test, expect } from './fixtures';
import { chatRequests, installChatFixture } from './chat-fixture';

test('selects rich file references by keyboard, preserves drafts, and submits actual paths with read mode', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, { references: true });
  await page.reload();
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await editor.fill('Use @');
  const menu = page.getByRole('listbox', { name: 'References', exact: true });
  await expect(menu).toBeVisible();
  await editor.press('ArrowDown');
  await editor.press('Enter');
  await expect(editor.locator('.file-mention')).toHaveText('VISUAL_IDENTITY_TASTE.md');
  expect(await chatRequests(desktopApp)).toHaveLength(0);
  await editor.pressSequentially('with @logo');
  await editor.press('Enter');
  await expect(editor.locator('.file-mention')).toHaveCount(2);
  await expect(editor.locator('.kind-logo')).toContainText('Brand image');
  await expect(editor).not.toContainText('/tmp/');
  await editor.press('Shift+Enter');
  await editor.pressSequentially('Explain before changing.');
  await page.getByRole('combobox', { name: 'Read only', exact: true }).selectOption('read');
  await page.locator('.chat-tabs').getByRole('button', { name: 'Titles · long form', exact: true }).click();
  await page.getByRole('button', { name: 'Brand attributes', exact: true }).click();
  await expect(editor.locator('.file-mention')).toHaveCount(2);
  await editor.press('Enter');
  await expect.poll(() => chatRequests(desktopApp)).toHaveLength(1);
  expect((await chatRequests(desktopApp))[0]).toMatchObject({
    sessionId: 'chat-one',
    mode: 'read',
    text: 'Use @[VISUAL_IDENTITY_TASTE.md](</tmp/chat-test/brand_identity/VISUAL_IDENTITY_TASTE.md>) with @[Brand image](</tmp/chat-test/brand_identity/logo.png>) \nExplain before changing.',
  });
  await expect(editor).toHaveText('');
});

test('inserts at the caret, dismisses suggestions, preserves IME Enter, and clears cached draft only on reset', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, { references: true });
  await page.reload();
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await editor.fill('Before  after');
  const caret = () =>
    editor.evaluate((element) => {
      const selection = window.getSelection();
      if (!selection?.anchorNode || !element.contains(selection.anchorNode)) return null;
      return { anchor: selection.anchorOffset, focus: selection.focusOffset };
    });
  await expect.poll(caret).toEqual({ anchor: 13, focus: 13 });
  // Avoid ProseMirror's just-focused document-start correction while exercising real keyboard movement.
  for (let index = 0; index < 6; index++) await editor.press('ArrowLeft');
  await expect.poll(caret).toEqual({ anchor: 7, focus: 7 });
  await editor.pressSequentially('@brand');
  await page.getByRole('option', { name: 'brand_config.yml', exact: true }).click();
  await expect(editor.locator('.kind-config')).toHaveText('brand_config.yml');
  await expect(editor).toContainText('Before brand_config.yml  after');
  await editor.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await editor.pressSequentially(' @nonexistent');
  await expect(page.getByText('No matching files in this conversation.', { exact: true })).toBeVisible();
  await editor.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await editor.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  expect(await chatRequests(desktopApp)).toHaveLength(0);
  await page.getByRole('button', { name: 'Start a fresh conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(editor).toHaveText('');
  await page.reload();
  await expect(editor).toHaveText('');
});
