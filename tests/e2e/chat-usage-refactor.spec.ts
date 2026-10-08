import { test, expect } from './development-fixtures';
import {
  cancelCalls,
  compactCalls,
  installChatUsageFixture,
  usageControl,
} from './chat-usage-refactor-fixture';
import type { ChatUsage } from '../../src/domain/chat-usage';

const usage: ChatUsage = {
  context: { usedTokens: 82000, maxTokens: 200000, totalTokens: 1200000, observedAt: '2026-10-07T18:00:00Z' },
  account: {
    available: true,
    checkedAt: '2026-10-07T18:00:00Z',
    windows: [
      { id: 'primary', usedPercent: 72, durationMinutes: 300, resetsAt: '2026-10-08T00:00:00Z' },
      { id: 'secondary', usedPercent: 9, durationMinutes: 10080, resetsAt: null },
    ],
  },
};

test('native usage popup distinguishes context, cumulative tokens, quotas and unavailable refresh above the composer', async ({
  desktopApp,
  page,
}) => {
  await installChatUsageFixture(desktopApp, usage);
  await page.reload();
  const trigger = page.locator('.chat-usage-trigger').first();
  await expect(trigger).toHaveAccessibleName('Context window: 59% available');
  await trigger.click();
  const popup = page.getByRole('dialog', { name: 'Usage', exact: true });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('82,000 / 200,000 tokens');
  await expect(popup).toContainText('1,200,000');
  await expect(popup).toContainText('28% remaining');
  await expect(popup).toContainText('91% remaining');
  expect(await popup.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  const top = await popup.boundingBox();
  const bottom = await trigger.boundingBox();
  expect(top && bottom && top.y + top.height <= bottom.y).toBe(true);
  await usageControl(desktopApp, {
    usage: { context: null, account: { available: false, windows: [], checkedAt: new Date().toISOString() } },
  });
  await popup.getByRole('button', { name: 'Refresh usage', exact: true }).click();
  await expect(popup.getByText('Unavailable', { exact: true })).toHaveCount(2);
  await expect(popup).not.toContainText('28% remaining');
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('compact waits for actual settlement, blocks duplicate actions and queued work, and preserves the composer draft', async ({
  desktopApp,
  page,
}) => {
  await installChatUsageFixture(desktopApp, usage);
  await page.reload();
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await editor.fill('Keep this unsent draft');
  await page.getByRole('button', { name: 'Context window: 59% available', exact: true }).first().click();
  const popup = page.getByRole('dialog', { name: 'Usage', exact: true });
  const compact = popup.getByRole('button', { name: 'Compact context', exact: true });
  await expect(compact).toBeEnabled();
  await usageControl(desktopApp, { queued: true });
  await expect(compact).toBeDisabled();
  await usageControl(desktopApp, { queued: false });
  await expect(compact).toBeEnabled();
  await compact.click();
  await expect(popup).toHaveAttribute('aria-busy', 'true');
  await expect(popup.getByRole('button', { name: 'Compacting context…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(popup).toBeVisible();
  expect(await compactCalls(desktopApp)).toBe(1);
  const stop = popup.getByRole('button', { name: 'Stop', exact: true });
  await stop.click();
  await expect(stop).toBeDisabled();
  await expect(stop).toHaveAttribute('aria-busy', 'true');
  await expect(popup).toHaveAttribute('aria-busy', 'true');
  expect(await cancelCalls(desktopApp)).toBe(1);
  await usageControl(desktopApp, { complete: true });
  await expect(popup.getByRole('button', { name: 'Compact context', exact: true })).toBeEnabled();
  await expect(editor).toHaveText('Keep this unsent draft');
  expect(await compactCalls(desktopApp)).toBe(1);
});
