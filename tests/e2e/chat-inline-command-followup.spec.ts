import type { Page } from '@playwright/test';
import type { ModelInfo } from '../../src/domain/models';
import { test, expect } from './development-fixtures';
import {
  installInlineCommandFixture,
  inlineControl,
  inlineState,
} from './chat-inline-commands-followup-fixture';

async function caret(page: Page, text: string, offset: number) {
  await page.locator('.composer:visible .rich-composer').evaluate(
    (editor, location) => {
      const nodes = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = nodes.nextNode())) {
        if (node.textContent === location.text) {
          const range = document.createRange();
          range.setStart(node, location.offset);
          range.collapse(true);
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.addRange(range);
          (editor as HTMLElement).focus();
          return;
        }
      }
      throw new Error('The reviewed text node must exist');
    },
    { text, offset },
  );
}

const reasoning = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const models: ModelInfo[] = [
  {
    id: 'test-model',
    name: 'Current model',
    description: '',
    reasoning,
    defaultReasoning: 'low',
    fast: true,
    isDefault: true,
  },
];

test('inline skills replace only the middle token, retain native attachments and Plan mode, and keep command chrome absent', async ({
  desktopApp,
  page,
}, testInfo) => {
  await installInlineCommandFixture(desktopApp, models);
  await page.reload();
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  const composer = page.locator('.composer:visible');
  const mode = composer.getByRole('combobox');
  await expect(composer.getByRole('button', { name: 'Commands', exact: true })).toHaveCount(0);
  await expect(composer.getByRole('button', { name: 'Stash draft (⌘/Ctrl+S)', exact: true })).toHaveCount(0);
  await expect(composer.getByRole('button', { name: 'Compact context', exact: true })).toHaveCount(0);
  await editor.fill('Before  after');
  await mode.click();
  await page.getByRole('listbox').getByRole('option', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Attach files', exact: true }).click();
  await expect(composer.locator('.attachment')).toHaveText(['scene.png']);
  await caret(page, 'Before  after ', 7);
  await page.keyboard.type('$hyp');
  const menu = page.getByRole('listbox', { name: 'Commands', exact: true });
  const skill = menu.getByRole('option', { name: '$hyperframes Enabled studio skill', exact: true });
  await expect(skill).toBeVisible();
  await expect(editor).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCount(0);
  await expect(editor).toContainText('Before $hyperframes after');
  await expect(mode).toHaveText('Plan');
  await expect(composer.locator('.attachment')).toHaveText(['scene.png']);
  await page.screenshot({ path: testInfo.outputPath('inline-skill-composer.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(async () => (await inlineState(desktopApp)).requests).toHaveLength(1);
  expect((await inlineState(desktopApp)).requests[0]).toMatchObject({
    text: 'Before $hyperframes after @[scene.png](</native/scene.png>)',
    mode: 'read',
    collaboration: 'plan',
    attachments: ['/native/scene.png'],
  });
  await expect(editor).toContainText('Before $hyperframes after');
  await expect(composer.locator('.attachment')).toHaveText(['scene.png']);
});

test('inline command dismissal, escaped triggers, composition and attachment picking preserve exact draft ownership', async ({
  desktopApp,
  page,
}) => {
  await installInlineCommandFixture(desktopApp, models);
  await page.reload();
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  const menu = page.getByRole('listbox', { name: 'Commands', exact: true });
  await editor.fill('Before \\$hyp');
  await expect(menu).toHaveCount(0);
  await inlineControl(desktopApp, { skillsHold: true });
  await editor.fill('Before $hyper');
  await expect(menu.getByRole('status')).toContainText('Loading');
  await editor.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
  await expect(editor).toHaveText('Before $hyper');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await inlineControl(desktopApp, { skillsHold: false });
  await expect(editor).toHaveText('Before $hyper');
  await editor.fill('Before $read');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Shift+Tab');
  await expect(editor).toHaveText('Before $read');
  await expect(page.locator('.composer:visible .mode-choice')).toHaveText('Allow edits');
  await menu.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText('Before $read');
  await editor.fill('Before ');
  await page.keyboard.type('$read');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(editor).toHaveText('Before ');
  await expect(page.locator('.composer:visible .mode-choice')).toHaveText('Read only');
  await editor.fill('Before $edit');
  await expect(menu).toBeVisible();
  await inlineControl(desktopApp, { pickerHold: true });
  const attach = page.getByRole('button', { name: 'Attach files', exact: true });
  await attach.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(attach).toHaveAttribute('aria-busy', 'true');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.composer:visible .mode-choice')).toHaveText('Read only');
  expect((await inlineState(desktopApp)).pickerCalls).toBe(1);
  expect((await inlineState(desktopApp)).requests).toHaveLength(0);
  await inlineControl(desktopApp, { pickerHold: false });
  await expect(attach).toBeEnabled();
  await expect(editor).toContainText('Before $edit');
  await expect(page.locator('.composer:visible .attachment')).toHaveText(['scene.png']);
});

test('model command removes only its range and its portal closes when the composer is hidden; stash remains available by command', async ({
  desktopApp,
  page,
}) => {
  await installInlineCommandFixture(desktopApp, models);
  await page.reload();
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await editor.fill('Keep $model after');
  await caret(page, 'Keep $model after', 11);
  const commands = page.getByRole('listbox', { name: 'Commands', exact: true });
  await expect(
    commands.getByRole('option', {
      name: '$model Choose the Codex model without changing your draft or mode.',
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  const modelsMenu = page.getByRole('listbox', { name: 'Model', exact: true });
  await expect(modelsMenu).toBeVisible();
  await expect(editor).toHaveText('Keep  after');
  await page.getByRole('button', { name: 'Titles · long form', exact: true }).click();
  await expect(modelsMenu).toHaveCount(0);
  await page.getByRole('button', { name: 'Brand attributes', exact: true }).click();
  await expect(editor).toHaveText('Keep  after');
  await editor.fill('Keep $stash after');
  await caret(page, 'Keep $stash after', 11);
  await expect(commands.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  const stash = page.getByRole('dialog', { name: 'Stash', exact: true });
  await expect(stash).toBeVisible();
  await expect(editor).toHaveText('');
  await stash.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await expect(editor).toHaveText('Keep  after');
  await expect(stash).toHaveCount(0);
});

test('thinking icons distinguish every supported effort and show the same image after selection', async ({
  desktopApp,
  page,
}, testInfo) => {
  await installInlineCommandFixture(desktopApp, models);
  await page.reload();
  const effort = page
    .locator('.composer-wrap:visible')
    .getByRole('combobox', { name: 'Thinking', exact: true });
  const labels = ['None', 'Minimal', 'Low', 'Medium', 'High', 'Extra high', 'Maximum', 'Ultra'];
  const signatures: string[] = [];
  for (const label of labels) {
    await effort.click();
    const menu = page.getByRole('listbox', { name: 'Thinking', exact: true });
    await expect(menu.getByRole('option')).toHaveCount(8);
    const option = menu.getByRole('option', { name: label, exact: true });
    const icon = await option.locator('svg.selection-icon').evaluate((svg) => svg.innerHTML);
    signatures.push(icon);
    if (label === 'Low' || label === 'Medium')
      await expect(option.locator('svg.reasoning-bars rect')).toHaveCount(label === 'Low' ? 2 : 3);
    await option.click();
    await expect(effort).toHaveText(label);
    await expect(page.locator('.composer-wrap:visible > .model-controls-attached')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    expect(await effort.locator('svg.selection-icon').evaluate((svg) => svg.innerHTML)).toBe(icon);
  }
  expect(new Set(signatures).size).toBe(8);
  await effort.click();
  await page.screenshot({ path: testInfo.outputPath('distinct-thinking-icons.png'), animations: 'disabled' });
});

test('leading slash aliases preserve the remainder and respect IME, picker and hidden-menu ownership without sending', async ({
  desktopApp,
  page,
}) => {
  await installInlineCommandFixture(desktopApp, models);
  await page.reload();
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  const mode = page.locator('.composer:visible .mode-choice');
  const commands = page.getByRole('listbox', { name: 'Commands', exact: true });
  await editor.fill('/read Keep  exact remainder');
  await caret(page, '/read Keep  exact remainder', 5);
  await expect(commands.getByRole('option')).toHaveCount(1);
  await editor.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
  await expect(editor).toHaveText('/read Keep  exact remainder');
  await expect(mode).toHaveText('Allow edits');
  await page.keyboard.press('ArrowUp');
  await expect(editor).toHaveText('/read Keep  exact remainder');
  await page.keyboard.press('Enter');
  await expect(commands).toHaveCount(0);
  await expect(editor).toHaveText(' Keep  exact remainder');
  await expect(mode).toHaveText('Read only');

  await editor.fill('/plan Keep  exact remainder');
  await caret(page, '/plan Keep  exact remainder', 5);
  await expect(commands.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(editor).toHaveText(' Keep  exact remainder');
  await expect(mode).toHaveText('Plan');

  await editor.fill('/edit Keep  exact remainder');
  await caret(page, '/edit Keep  exact remainder', 5);
  await expect(commands.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(mode).toHaveText('Allow edits');
  await expect(editor).toHaveText(' Keep  exact remainder');

  for (const text of ['See /read', 'https://example.com/read', '/tmp/read']) {
    await editor.fill(text);
    await expect(commands).toHaveCount(0);
    await expect(editor).toHaveText(text);
  }
  await editor.fill('/compact');
  await expect(commands.getByRole('option')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Compact context', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveText('/compact');

  await editor.fill('/read Held draft');
  await caret(page, '/read Held draft', 5);
  await expect(commands.getByRole('option')).toHaveCount(1);
  await inlineControl(desktopApp, { pickerHold: true });
  const attach = page.getByRole('button', { name: 'Attach files', exact: true });
  await attach.click();
  await expect(attach).toHaveAttribute('aria-busy', 'true');
  await expect(commands).toHaveCount(0);
  await expect(mode).toHaveText('Allow edits');
  await inlineControl(desktopApp, { pickerHold: false });
  await expect(attach).toBeEnabled();
  await expect(editor).toContainText('/read Held draft');
  await expect(page.locator('.composer:visible .attachment')).toHaveText(['scene.png']);

  await editor.fill('/model Keep model remainder');
  await caret(page, '/model Keep model remainder', 6);
  await expect(commands.getByRole('option')).toHaveCount(2);
  await page.getByRole('button', { name: 'Titles · long form', exact: true }).click();
  await expect(commands).toHaveCount(0);
  await page.getByRole('button', { name: 'Brand attributes', exact: true }).click();
  await expect(commands).toHaveCount(0);
  await expect(editor).toHaveText('/model Keep model remainder');
  await editor.fill('/model Reviewed remainder');
  await caret(page, '/model Reviewed remainder', 6);
  await expect(commands.getByRole('option')).toHaveCount(2);
  await page.keyboard.press('Enter');
  const modelMenu = page.getByRole('listbox', { name: 'Model', exact: true });
  await expect(modelMenu).toBeVisible();
  await expect(editor).toHaveText(' Reviewed remainder');
  await expect(mode).toHaveText('Allow edits');
  await page.keyboard.press('Escape');
  await expect(modelMenu).toHaveCount(0);
  expect((await inlineState(desktopApp)).requests).toHaveLength(0);
});
