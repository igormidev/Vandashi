import type { ElectronApplication } from '@playwright/test';
import { test, expect } from './development-fixtures';
import { installChatRefactorFixture } from './chat-refactor-fixture';
import { chatControl } from './chat-fixture';
import type { ChatMessage } from '../../src/domain/models';

async function preservingClipboard(app: ElectronApplication, task: () => Promise<void>) {
  // Snapshot and restore all native flavors in the main process without exposing private bytes.
  const saved = await app.evaluateHandle(async ({ clipboard, ClipboardItem }) => {
    const items = await Promise.all(
      (await clipboard.read())
        .filter((item) => item.types.length)
        .map(async (item) => {
          const entries = await Promise.all(
            item.types.map(async (type) => [type, await item.getType(type)] as const),
          );
          return new ClipboardItem(Object.fromEntries(entries));
        }),
    );
    return {
      restore: async () => {
        if (items.length) await clipboard.write(items);
        else clipboard.clear();
      },
    };
  });
  try {
    await saved.evaluate((state) => state.restore());
    await task();
  } finally {
    await saved.evaluate((state) => state.restore());
    await saved.dispose();
  }
}

function provider(
  id: string,
  role: ChatMessage['role'],
  text: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return { id, role, text, turnId: 'turn', files: [], createdAt: '2026-10-07T12:00:00Z', ...overrides };
}

test('long sent messages fold and expand while copy preserves the complete original native text', async ({
  desktopApp,
  page,
}) => {
  const original = Array.from(
    { length: 12 },
    (_, index) =>
      `Paragraph ${String(index + 1)}. ${'Preserve this original user message and its formatting. '.repeat(5)}`,
  ).join('\n\n');
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [provider('long-user', 'user', original)],
  });
  await page.reload();
  const message = page.locator('[data-message-id="long-user"]');
  const body = message.locator('.message-body');
  await expect(message.getByRole('button', { name: 'Show more', exact: true })).toBeVisible();
  expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await preservingClipboard(desktopApp, async () => {
    await message.hover();
    await message.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(message.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
    expect(await desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(original);
  });
  await message.getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(body).not.toHaveClass(/message-user-clamped/);
  expect(await body.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await message.getByRole('button', { name: 'Show less', exact: true }).click();
  await expect(body).toHaveClass(/message-user-clamped/);
});

test('provider Markdown renders tables and task lists with native fenced-code copying and language headers', async ({
  desktopApp,
  page,
}) => {
  const markdown =
    '| Asset | Status |\n| --- | --- |\n| Logo | Ready |\n\n- [x] Read the guide\n- [ ] Edit the video\n\n~~Previous wording~~\n\n```ts\nconst answer = 42;\n```';
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [provider('markdown-answer', 'assistant', markdown)],
  });
  await page.reload();
  const message = page.locator('[data-message-id="markdown-answer"]');
  await expect(message.getByRole('table')).toBeVisible();
  await expect(message.getByRole('cell', { name: 'Logo', exact: true })).toBeVisible();
  await expect(message.getByRole('checkbox')).toHaveCount(2);
  await expect(message.getByRole('checkbox').first()).toBeChecked();
  await expect(message.getByRole('checkbox').first()).toBeDisabled();
  await expect(message.locator('del')).toHaveText('Previous wording');
  const code = message.locator('.chat-code');
  await expect(code.locator('.chat-code-heading > span')).toHaveText('ts');
  await preservingClipboard(desktopApp, async () => {
    await code.hover();
    await code.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(code.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
    expect(await desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe('const answer = 42;\n');
  });
});

test('thinking and parallel tools retain live expandable work logs across commentary and isolate a new turn', async ({
  desktopApp,
  page,
}) => {
  const thinking = provider(
    'thinking',
    'reasoning',
    '**Reading the guide**\n\nI will preserve the existing brand wording.',
    { streaming: true },
  );
  const active = provider('active-tool', 'tool', 'cat script.md\nscript contents', {
    streaming: true,
    activity: { kind: 'read', status: 'inProgress', command: 'cat script.md', detail: 'script contents' },
  });
  const done = provider('finished-tool', 'tool', 'rg logo\nlogo.png', {
    streaming: false,
    activity: { kind: 'search', status: 'completed', command: 'rg logo', detail: 'logo.png', exitCode: 0 },
  });
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [
      provider('request', 'user', 'Read these files'),
      thinking,
      active,
      done,
      provider('commentary', 'assistant', 'The search finished; the read is still running.', {
        phase: 'commentary',
      }),
    ],
  });
  await page.reload();
  await chatControl(desktopApp, {
    event: { type: 'activity', activity: { sessionId: 'chat-one', phase: 'working', detail: '' } },
  });
  const work = page.locator('.chat-work-log');
  await expect(work).toHaveClass(/is-live/);
  await expect(work.locator('.chat-work-heading')).toHaveAttribute('aria-expanded', 'true');
  await expect(work.locator('.chat-work-heading')).toContainText('cat script.md');
  await expect(work.locator('.chat-work-details').first()).toContainText(
    'I will preserve the existing brand wording.',
  );
  const command = work.locator('.chat-work-row').filter({ hasText: 'cat script.md' });
  await expect(command).toHaveAttribute('aria-expanded', 'false');
  await command.click();
  await expect(work.locator('.chat-tool-output').filter({ hasText: 'script contents' })).toBeVisible();
  await expect(page.locator('[data-message-id="commentary"]')).toBeVisible();
  await work.locator('.chat-work-heading').click();
  await expect(work.locator('.chat-work-heading')).toHaveAttribute('aria-expanded', 'false');
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: { ...thinking, text: `${thinking.text}\n\nAnother available summary.` },
    },
  });
  await expect(work.locator('.chat-work-heading')).toHaveAttribute('aria-expanded', 'false');
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: provider('next-request', 'user', 'Next request', { turnId: 'next-turn' }),
    },
  });
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: provider('next-thought', 'reasoning', '**Checking the next request**', {
        turnId: 'next-turn',
        streaming: true,
      }),
    },
  });
  await expect(page.locator('.chat-work-log')).toHaveCount(2);
  await expect(page.locator('.chat-work-log').first()).not.toHaveClass(/is-live/);
  await expect(page.locator('.chat-work-log').last()).toHaveClass(/is-live/);
});
