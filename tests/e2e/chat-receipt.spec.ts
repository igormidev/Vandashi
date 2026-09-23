import { test, expect } from './fixtures';
import { chatControl } from './chat-controls';
import { installReceiptFixture } from './chat-receipt-fixture';
import type { AppEvent } from '../../src/domain/models';

test('shows a distinct saved receipt and expands its actual file diff beside preserved agent text', async ({
  desktopApp,
  page,
}) => {
  await installReceiptFixture(desktopApp);
  await page.reload();
  await expect(page.getByText('Saved conversation one', { exact: true })).toBeVisible();
  const base = { turnId: 'receipt-turn', createdAt: new Date().toISOString() };
  await chatControl(desktopApp, {
    persistEvent: true,
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
  const saved: AppEvent = {
    type: 'chat',
    sessionId: 'chat-one',
    delta: false,
    message: {
      ...base,
      id: 'receipt:thread-one:receipt-turn',
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
  };
  await chatControl(desktopApp, { event: saved, persistEvent: true });
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
  const toast = page.locator('.toast');
  await expect(toast).toHaveText('Changes saved.');
  await toast.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(receipt.getByText('Changes saved.', { exact: true })).toBeVisible();
  await chatControl(desktopApp, { event: saved });
  await expect(toast).toHaveCount(0);
  await page.reload();
  await expect(receipt.getByText('Changes saved.', { exact: true })).toBeVisible();
  await expect(receipt.getByText('script.md', { exact: true })).toBeVisible();
  await expect(toast).toHaveCount(0);
});

test('does not toast saved changes for no-change receipts, read-only answers, helpers, or failed turns', async ({
  desktopApp,
  page,
}) => {
  await installReceiptFixture(desktopApp);
  await page.reload();
  await expect(page.getByText('Saved conversation one', { exact: true })).toBeVisible();
  for (const role of ['assistant', 'error', 'tool'] as const) {
    await chatControl(desktopApp, {
      persistEvent: true,
      event: {
        type: 'chat',
        sessionId: 'chat-one',
        delta: false,
        message: {
          id: `receipt:thread-one:${role}`,
          role,
          turnId: role,
          text: role === 'error' ? 'The turn failed.' : 'Changes saved.',
          files: [],
          createdAt: '',
          ...(role === 'tool' ? { appMessage: { id: 'turnUnchanged' } as const } : {}),
        },
      },
    });
    await chatControl(desktopApp, {
      event: {
        type: 'activity',
        activity: { sessionId: 'chat-one', phase: role === 'error' ? 'error' : 'done', detail: '' },
      },
    });
    await expect(page.locator('.toast')).toHaveCount(0);
  }
  await chatControl(desktopApp, {
    event: {
      type: 'activity',
      activity: { sessionId: 'helper:commit', phase: 'done', detail: 'Changes saved.' },
    },
  });
  await expect(page.locator('article.receipt')).toHaveText('No file changes.');
  await expect(page.getByText('The turn failed.', { exact: true })).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('article.receipt')).toHaveText('No file changes.');
  await expect(page.locator('.toast')).toHaveCount(0);
});
