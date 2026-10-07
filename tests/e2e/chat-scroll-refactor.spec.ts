import { test, expect } from './development-fixtures';
import type { Locator } from '@playwright/test';
import { installChatRefactorFixture } from './chat-refactor-fixture';
import { chatControl, chatRequests } from './chat-fixture';
import type { ChatMessage } from '../../src/domain/models';

const message = (id: string, text: string): ChatMessage => ({
  id,
  role: 'assistant',
  text,
  turnId: id,
  files: [],
  createdAt: '2026-10-07T12:00:00Z',
  streaming: false,
});
const history = () =>
  Array.from({ length: 24 }, (_, index) =>
    message(
      `reading-${String(index)}`,
      `## Section ${String(index)}\n\n${'The reader keeps this exact place while replies arrive. '.repeat(22)}\n\nA final paragraph.`,
    ),
  );

async function anchor(scroll: Locator) {
  return scroll.evaluate((node) => {
    const top = node.getBoundingClientRect().top + node.clientTop;
    const row = [...node.querySelectorAll<HTMLElement>('[data-chat-row-id]')].find(
      (entry) => entry.getBoundingClientRect().bottom > top,
    );
    return { id: row?.dataset.chatRowId, offset: row ? row.getBoundingClientRect().top - top : null };
  });
}

test('reading anchors survive short conversation switches and preserve the visible row through text reflow', async ({
  desktopApp,
  page,
}) => {
  await installChatRefactorFixture(desktopApp, { initialMessages: history() });
  await page.reload();
  const scroll = page.locator('.messages');
  await expect(page.locator('[data-message-id="reading-23"]')).toBeVisible();
  await scroll.evaluate((node) => {
    const row = node.querySelector<HTMLElement>('[data-chat-row-id="reading-10"]');
    if (!row) throw new Error('Missing reading row');
    node.scrollTop += row.getBoundingClientRect().top - node.getBoundingClientRect().top + 70;
  });
  await expect(page.getByRole('button', { name: 'Scroll to latest message', exact: true })).toBeVisible();
  const reading = await anchor(scroll);
  await page.locator('.chat-tabs').getByRole('button', { name: 'Titles · long form', exact: true }).click();
  await expect(page.locator('[data-message-id="history-two"]')).toBeVisible();
  await page.locator('.chat-tabs').getByRole('button', { name: 'Brand attributes', exact: true }).click();
  await expect.poll(async () => (await anchor(scroll)).id).toBe(reading.id);
  await expect
    .poll(async () => Math.abs(((await anchor(scroll)).offset ?? 999) - (reading.offset ?? 0)))
    .toBeLessThan(2);
  await page.getByRole('button', { name: 'Increase text size', exact: true }).click();
  await expect.poll(async () => (await anchor(scroll)).id).toBe(reading.id);
  await expect
    .poll(async () => Math.abs(((await anchor(scroll)).offset ?? 999) - (reading.offset ?? 0)))
    .toBeLessThan(2);
  await desktopApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1260, 780);
  });
  await expect.poll(async () => (await anchor(scroll)).id).toBe(reading.id);
  await expect
    .poll(async () => Math.abs(((await anchor(scroll)).offset ?? 999) - (reading.offset ?? 0)))
    .toBeLessThan(2);
});

test('streamed growth respects a reading anchor and the explicit bottom action resumes following', async ({
  desktopApp,
  page,
}) => {
  await installChatRefactorFixture(desktopApp, { initialMessages: history() });
  await page.reload();
  const scroll = page.locator('.messages');
  await scroll.evaluate((node) => {
    node.scrollTop = node.scrollHeight / 2;
  });
  await expect(page.getByRole('button', { name: 'Scroll to latest message', exact: true })).toBeVisible();
  const reading = await anchor(scroll);
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: { ...message('stream', 'New streaming answer.\n\n'.repeat(20)), streaming: true },
    },
  });
  await expect.poll(async () => (await anchor(scroll)).id).toBe(reading.id);
  await expect
    .poll(async () => Math.abs(((await anchor(scroll)).offset ?? 999) - (reading.offset ?? 0)))
    .toBeLessThan(2);
  await page.getByRole('button', { name: 'Scroll to latest message', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Scroll to latest message', exact: true })).toHaveCount(0);
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: true,
      message: { ...message('stream', 'More streaming content.\n\n'.repeat(15)), streaming: true },
    },
  });
  await expect
    .poll(() => scroll.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight))
    .toBeLessThan(2);
});

test('quote source fragments navigate within the selected conversation without granting native paths', async ({
  desktopApp,
  page,
}) => {
  const original = message('source [unicode] 雪', 'Source text stays in this conversation.');
  const source = `#chat-message-${encodeURIComponent(original.id)}`;
  await installChatRefactorFixture(desktopApp, {
    observeLinkAccess: true,
    initialMessages: [
      original,
      ...history(),
      message(
        'citations',
        `[Original message](${source})\n\n[Missing source](#chat-message-absent)\n\n[Other fragment](#other-fragment)\n\n[Malformed source](#chat-message-%ZZ)`,
      ),
    ],
  });
  await page.reload();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const links = page.locator('[data-message-id="citations"]');
  await links.getByRole('link', { name: 'Other fragment', exact: true }).click();
  await links.getByRole('link', { name: 'Malformed source', exact: true }).click();
  const before = await chatRequests(desktopApp);
  await links.getByRole('link', { name: 'Missing source', exact: true }).click();
  await expect(
    page.getByText('The quoted response is no longer in this conversation.', { exact: true }),
  ).toBeVisible();
  await links.getByRole('link', { name: 'Original message', exact: true }).click();
  await expect.poll(async () => (await anchor(page.locator('.messages'))).id).toBe(original.id);
  expect(await chatRequests(desktopApp)).toEqual(before);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('streaming preserves selected historical text and quote ownership never crosses message bodies', async ({
  desktopApp,
  page,
}) => {
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [
      message('selected-source', 'First passage and unrelated words.'),
      message('different-source', 'Different message entirely.'),
    ],
  });
  await page.reload();
  const source = page.locator('[data-message-id="selected-source"]');
  await source.locator('.message-body p').evaluate((element) => {
    const node = element.firstChild;
    if (!node) throw new Error('Missing source text');
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 'First passage'.length);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
  });
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: { ...message('stream', 'A new provider delta.'), streaming: true },
    },
  });
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('First passage');
  await source.getByRole('button', { name: 'Quote in reply', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await expect(composer).toContainText('> First passage');
  await expect(composer).not.toContainText('unrelated words');
  await expect(composer).toContainText('#chat-message-selected-source');
  await composer.fill('');
  await source.locator('.message-body p').evaluate((element) => {
    const first = element.firstChild;
    const other = document.querySelector('[data-message-id="different-source"] .message-body p')?.firstChild;
    if (!first || !other) throw new Error('Missing message boundary');
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(other, 'Different message'.length);
    const selected = window.getSelection();
    selected?.removeAllRanges();
    selected?.addRange(range);
  });
  await source.getByRole('button', { name: 'Quote in reply', exact: true }).click();
  await expect(composer).toContainText('> First passage and unrelated words.');
  await expect(composer).not.toContainText('Different message');
});
