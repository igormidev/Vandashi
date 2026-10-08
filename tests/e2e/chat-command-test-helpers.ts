import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function leadingCommandCaret(page: Page, token: string) {
  await page.locator('.composer:visible .rich-composer').evaluate((editor, command) => {
    const nodes = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const first = nodes.nextNode();
    if (!first?.textContent?.startsWith(command)) throw new Error('The reviewed leading token must exist.');
    const range = document.createRange();
    range.setStart(first, command.length);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    (editor as HTMLElement).focus();
  }, token);
}

export function cachedComposerText(page: Page, sessionId = 'chat-one'): Promise<string> {
  return page.evaluate((id) => {
    const cached = JSON.parse(localStorage.getItem('vandashi.draft.' + id) ?? '{}') as { text: string };
    return cached.text;
  }, sessionId);
}

/** Removing the command preserves a draft's existing separator, including attachment trailing space. */
export async function openStashFromDraft(page: Page) {
  const needsSeparator = await page.locator('.composer:visible .rich-composer').evaluate((editor) => {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    (editor as HTMLElement).focus();
    const text = editor.textContent;
    return !!text && !/\s$/u.test(text);
  });
  await page.keyboard.type(needsSeparator ? ' $restore' : '$restore');
  const commands = page.getByRole('listbox', { name: 'Commands', exact: true });
  await expect(commands.getByRole('option', { name: '$restore Restore draft', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Stash', exact: true })).toBeVisible();
}
