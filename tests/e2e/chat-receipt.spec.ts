import { test, expect } from './fixtures';
import { chatControl, installChatFixture } from './chat-fixture';

test('shows a distinct saved receipt and expands its actual file diff beside preserved agent text', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await page.reload();
  await expect(page.getByText('Saved conversation one', { exact: true })).toBeVisible();
  const base = { turnId: 'receipt-turn', createdAt: new Date().toISOString() };
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: {
        ...base,
        id: 'old-agent-result',
        role: 'assistant',
        text: 'My commit was blocked by index.lock.',
        files: [],
      },
    },
  });
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: {
        ...base,
        id: 'app-receipt',
        role: 'tool',
        text: 'Fallback text must not drive the label.',
        appMessage: { id: 'turnSaved' },
        files: [
          {
            path: '/brand/video/script.md',
            additions: 1,
            deletions: 1,
            diff: '-Before\n+Verified saved change',
          },
        ],
      },
    },
  });
  await expect(page.getByText('My commit was blocked by index.lock.', { exact: true })).toBeVisible();
  const receipt = page.locator('article.receipt');
  await expect(receipt.getByText('Changes saved.', { exact: true })).toBeVisible();
  await expect(receipt.getByText('script.md', { exact: true })).toBeVisible();
  await expect(receipt.getByText('script.md', { exact: true })).toHaveAttribute(
    'title',
    '/brand/video/script.md',
  );
  await receipt.getByText('script.md', { exact: true }).click();
  await expect(receipt.getByText('+Verified saved change', { exact: true })).toBeVisible();
  await expect(page.getByText('Fallback text must not drive the label.', { exact: true })).toHaveCount(0);
});
