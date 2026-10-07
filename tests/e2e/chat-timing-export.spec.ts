import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from './fixtures';
import { installChatRefactorFixture } from './chat-refactor-fixture';
import { chatControl } from './chat-fixture';
import type { ChatMessage } from '../../src/domain/models';

const proposed = (text: string, streaming: boolean): ChatMessage => ({
  id: 'proposal',
  role: 'assistant',
  text,
  files: [],
  createdAt: '',
  turnId: 'turn',
  proposedPlan: true,
  streaming,
});

test('proposed plan exports complete Markdown through native Blob download without navigating or changing workspace', async ({
  desktopApp,
  page,
  userData,
}) => {
  const text =
    '# Review / the guide\n\n- Preserve **every** word.\n- Revisão do roteiro.\n\n```ts\nconst value = "<script>literal source</script>";\n```\n';
  await installChatRefactorFixture(desktopApp, { initialMessages: [proposed(text, true)] });
  await page.reload();
  const download = page.getByRole('button', { name: 'Download Markdown', exact: true });
  await expect(download).toBeDisabled();
  await expect(page.locator('a[download][hidden]')).toHaveCount(0);
  await chatControl(desktopApp, {
    event: { type: 'chat', sessionId: 'chat-one', delta: false, message: proposed(text, false) },
  });
  await expect(download).toBeEnabled();
  await expect(page.locator('a[download][hidden]')).toHaveAttribute('href', /^blob:/);
  const documentUrl = page.url();
  expect(documentUrl).toMatch(/^file:/);
  const file = join(userData, 'observed-plan-export.md');
  const exported = desktopApp.evaluate(
    ({ session }, savePath) =>
      new Promise<{ state: string; filename: string; url: string; document: string }>((resolve) => {
        session.defaultSession.once('will-download', (_event, item, contents) => {
          item.setSavePath(savePath);
          item.once('done', (_done, state) => {
            resolve({ state, filename: item.getFilename(), url: item.getURL(), document: contents.getURL() });
          });
        });
      }),
    file,
  );
  await download.focus();
  await download.press('Space');
  expect(await exported).toMatchObject({
    state: 'completed',
    filename: 'Review _ the guide.md',
    document: documentUrl,
  });
  expect(await readFile(file, 'utf8')).toBe(text);
  expect(page.url()).toBe(documentUrl);
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveText('');
});

test('live elapsed duration survives stream updates and disappears after observed work settles', async ({
  desktopApp,
  page,
}) => {
  const thought: ChatMessage = {
    id: 'thought',
    role: 'reasoning',
    text: 'Read the guide.',
    files: [],
    createdAt: '',
    turnId: 'turn',
    streaming: true,
  };
  await installChatRefactorFixture(desktopApp, { initialMessages: [thought] });
  await page.reload();
  await expect(page.locator('.chat-work-heading')).toBeVisible();
  await page.clock.install();
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'chat-one', phase: 'working', detail: '' } },
  });
  const elapsed = page.locator('.chat-work-heading .chat-work-duration');
  await expect(elapsed).toHaveText('0s');
  await page.clock.runFor(2100);
  await expect(elapsed).toHaveText('2s');
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: { ...thought, text: 'Read the guide and preserve the wording.' },
    },
  });
  await page.clock.runFor(1000);
  await expect(elapsed).toHaveText('3s');
  await expect(elapsed).toHaveAttribute('aria-label', 'Working 3s');
  await chatControl(desktopApp, {
    event: { type: 'chat', sessionId: 'chat-one', delta: false, message: { ...thought, streaming: false } },
  });
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'chat-one', phase: 'done', detail: '' } },
  });
  await expect(elapsed).toHaveCount(0);
});
