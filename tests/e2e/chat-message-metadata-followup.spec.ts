import { test, expect } from './fixtures';
import { installChatRefactorFixture } from './chat-refactor-fixture';
import { chatControl } from './chat-fixture';
import { preservingNativeClipboard } from './native-clipboard';
import type { ChatMessage } from '../../src/domain/models';

const known = '2026-10-08T10:00:00Z';
function message(id: string, role: 'user' | 'assistant', extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    role,
    text: id,
    files: [],
    createdAt: known,
    turnId: `turn-${id}`,
    streaming: false,
    ...extra,
  };
}

test('message metadata sits outside bubbles, mirrors footer order and preserves full native copy through hover and keyboard', async ({
  desktopApp,
  page,
}) => {
  const text = Array.from({ length: 25 }, (_, index) => `Original line ${String(index + 1)}`).join('\n');
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [
      message('user', 'user', { text }),
      message('answer', 'assistant', {
        text: 'Complete answer',
        turnDurationMs: (3 * 3600 + 7 * 60 + 29) * 1000,
      }),
      message('unknown', 'assistant', { text: 'Recovered answer', timestampKnown: false }),
    ],
  });
  await page.reload();
  const user = page.locator('[data-message-id="user"]');
  const answer = page.locator('[data-message-id="answer"]');
  await page.mouse.move(0, 0);
  await expect(user.locator('.message-time')).toBeVisible();
  await expect(answer.locator('.message-time')).toBeVisible();
  await expect(page.locator('[data-message-id="unknown"] .message-time')).toHaveCount(0);
  await expect(answer.locator('.message-worked')).toHaveText('Worked for 3h 7m 29s');
  for (const row of [user, answer]) {
    await expect(row.locator('.message-content .message-actions')).toHaveCount(0);
    await expect(row.locator('.message-action-icons')).toHaveCSS('opacity', '0');
    const content = await row.locator('.message-content').boundingBox();
    const footer = await row.locator('.message-actions').boundingBox();
    expect(content && footer && footer.y >= content.y + content.height).toBe(true);
  }
  const userTime = await user.locator('.message-time').boundingBox();
  const userIcons = await user.locator('.message-action-icons').boundingBox();
  const aiTime = await answer.locator('.message-time').boundingBox();
  const aiIcons = await answer.locator('.message-action-icons').boundingBox();
  expect(userTime && userIcons && userTime.x > userIcons.x).toBe(true);
  expect(aiTime && aiIcons && aiTime.x < aiIcons.x).toBe(true);
  await user.hover();
  await expect(user.locator('.message-action-icons')).toHaveCSS('opacity', '1');
  const expand = user.getByRole('button', { name: 'Show more', exact: true });
  await expand.click();
  await expect(user.locator('.message-body')).not.toHaveClass(/message-user-clamped/);
  await preservingNativeClipboard(desktopApp, async () => {
    const copy = user.getByRole('button', { name: 'Copy', exact: true });
    await copy.focus();
    await page.mouse.move(0, 0);
    await expect(user.locator('.message-action-icons')).toHaveCSS('opacity', '1');
    await page.evaluate(() => {
      const write = navigator.clipboard.writeText.bind(navigator.clipboard);
      const control = window as unknown as { releaseCopy: (() => void) | undefined };
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async (value: string) => {
          await new Promise<void>((resolve) => {
            control.releaseCopy = resolve;
          });
          await write(value);
        },
      });
    });
    await copy.press('Space');
    await expect(copy).toHaveAttribute('aria-busy', 'true');
    await expect(copy).toBeDisabled();
    await page.getByRole('textbox', { name: 'AI chat', exact: true }).focus();
    await expect(user.locator('.message-action-icons')).toHaveCSS('opacity', '1');
    await page.evaluate(() => {
      const control = window as unknown as { releaseCopy?: () => void };
      control.releaseCopy?.();
    });
    await expect.poll(() => desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(text);
    await expect(user.locator('.message-copy')).toHaveAttribute('aria-busy', 'false');
    await expect(user.locator('.message-action-icons')).toHaveCSS('opacity', '0');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(user.locator('.message-action-icons')).toHaveCSS('transition-duration', '0s');
});

test('timestamp tooltip updates days hours and minutes while open and remains available to keyboard', async ({
  desktopApp,
  page,
}) => {
  const now = new Date('2026-10-10T13:38:00Z');
  await installChatRefactorFixture(desktopApp, { initialMessages: [message('dated', 'assistant')] });
  await page.reload();
  await page.clock.install({ time: now });
  const timestamp = page.locator('[data-message-id="dated"] .message-time');
  await timestamp.hover();
  await expect(page.getByRole('tooltip')).toHaveText('2d, 3h, and 38m ago');
  await page.clock.runFor(60_000);
  await expect(page.getByRole('tooltip')).toHaveText('2d, 3h, and 39m ago');
  await page.mouse.move(0, 0);
  await timestamp.focus();
  await expect(page.getByRole('tooltip')).toHaveText('2d, 3h, and 39m ago');
  await timestamp.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('plans share settled duration and hover-only metadata without enabling unfinished work', async ({
  desktopApp,
  page,
}) => {
  const plan = message('proposal', 'assistant', {
    text: '# A plan\n\n- Preserve source.',
    proposedPlan: true,
    streaming: true,
  });
  await installChatRefactorFixture(desktopApp, { initialMessages: [plan] });
  await page.reload();
  const row = page.locator('[data-message-id="proposal"]');
  await expect(row.locator('.message-worked')).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Implement', exact: true })).toBeDisabled();
  await expect(row.locator('.chat-proposed-plan .message-actions')).toHaveCount(0);
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: { ...plan, streaming: false, turnDurationMs: 0 },
    },
  });
  await expect(row.locator('.message-worked')).toHaveText('Worked for 0s');
  await expect(row.getByRole('button', { name: 'Implement', exact: true })).toBeEnabled();
  await page.mouse.move(0, 0);
  await row.locator('.message-time').blur();
  await expect(row.locator('.message-action-icons')).toHaveCSS('opacity', '0');
  await row.hover();
  await expect(row.locator('.message-action-icons')).toHaveCSS('opacity', '1');
  await expect(row.getByRole('button', { name: 'Download Markdown', exact: true })).toBeEnabled();
});
