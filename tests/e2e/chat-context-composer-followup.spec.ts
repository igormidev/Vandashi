import { test, expect } from './fixtures';
import type { ChatUsage } from '../../src/domain/chat-usage';
import {
  compactCalls,
  installChatUsageFixture,
  usageControl,
  usageReadCalls,
} from './chat-usage-refactor-fixture';

const now = Date.parse('2026-10-08T10:00:00Z');
const reset = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
const usage: ChatUsage = {
  context: {
    usedTokens: 82000,
    maxTokens: 200000,
    totalTokens: 1200000,
    observedAt: new Date(now).toISOString(),
  },
  account: {
    available: true,
    checkedAt: new Date(now).toISOString(),
    windows: [
      { id: 'primary', usedPercent: 72, durationMinutes: 300, resetsAt: reset(65) },
      { id: 'secondary', usedPercent: 9, durationMinutes: 10080, resetsAt: reset(3067) },
    ],
  },
};

test('composer context icon shows native occupancy beside the access selector and independent countdowns update without renewing allowances', async ({
  desktopApp,
  page,
}) => {
  await installChatUsageFixture(desktopApp, usage);
  await page.reload();
  await page.clock.install({ time: new Date(now) });
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await editor.fill('Keep this unsent draft');
  const actions = page.locator('.chat-composer-slot:not([hidden]) .composer-actions');
  const trigger = actions.locator('.chat-usage-trigger');
  await expect(trigger).toHaveAttribute('aria-busy', 'false');
  await expect(trigger).toHaveAccessibleName('Context window: 41% used');
  await expect(trigger).toHaveText('');
  const mode = actions.locator('.mode-choice');
  const contextBounds = await trigger.boundingBox();
  const modeBounds = await mode.boundingBox();
  expect(contextBounds && modeBounds && contextBounds.x + contextBounds.width <= modeBounds.x).toBe(true);
  await expect(page.locator('.chat-usage')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Compact context', exact: true })).toHaveCount(0);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Usage', exact: true });
  await expect(dialog).toContainText('Resets in 1 hr, 5 min');
  await expect(dialog).toContainText('Resets in 2 days, 3 hr, 7 min');
  await expect(dialog).toContainText('28% remaining');
  await expect(dialog).toContainText('91% remaining');
  await expect(dialog.getByText(/^Resets \d/)).toHaveCount(2);
  await page.clock.fastForward(2 * 60_000);
  await expect(dialog).toContainText('Resets in 1 hr, 3 min');
  await expect(dialog).toContainText('Resets in 2 days, 3 hr, 5 min');
  await page.clock.fastForward(64 * 60_000);
  await expect(dialog).toContainText('Reset time reached. Refresh usage.');
  await expect(dialog).toContainText('28% remaining');
  await expect(dialog).toContainText('91% remaining');
  expect(await compactCalls(desktopApp)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(editor).toHaveText('Keep this unsent draft');
});

test('context refresh stays busy through native reads, recovers unavailable values and cannot overwrite a newer live observation', async ({
  desktopApp,
  page,
}) => {
  await installChatUsageFixture(desktopApp, usage, undefined, { usageHold: true });
  await page.reload();
  const trigger = page.locator('.chat-composer-slot:not([hidden]) .chat-usage-trigger');
  await expect(trigger).toHaveAttribute('aria-busy', 'true');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Usage', exact: true });
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.getByRole('button', { name: 'Compact context', exact: true })).toBeDisabled();
  expect(await usageReadCalls(desktopApp)).toBe(1);
  await usageControl(desktopApp, { usageFail: true, usageComplete: true });
  await expect(trigger).toHaveAttribute('aria-busy', 'false');
  await expect(trigger).toHaveAccessibleName('Context window unavailable');
  await expect(trigger.locator('.context-ring.unknown')).toHaveCount(1);
  await expect(dialog.getByText('Unavailable', { exact: true })).toHaveCount(2);
  await usageControl(desktopApp, { usageFail: false, usageHold: true });
  const refresh = dialog.getByRole('button', { name: 'Refresh usage', exact: true });
  await refresh.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(refresh).toBeDisabled();
  await expect.poll(() => usageReadCalls(desktopApp)).toBe(2);
  const context = {
    usedTokens: 25000,
    maxTokens: 100000,
    totalTokens: 1500000,
    observedAt: new Date(now).toISOString(),
  };
  await usageControl(desktopApp, { event: { type: 'chat-usage', sessionId: 'chat-one', context } });
  await usageControl(desktopApp, { usageComplete: true });
  await expect(trigger).toHaveAccessibleName('Context window: 25% used');
  await expect(dialog).toContainText('25,000 / 100,000 tokens');
  await expect(dialog).toContainText('28% remaining');
  await usageControl(desktopApp, { usageHold: true });
  await refresh.click();
  await expect.poll(() => usageReadCalls(desktopApp)).toBe(3);
  await usageControl(desktopApp, {
    event: {
      type: 'chat-usage',
      sessionId: 'chat-one',
      context: { ...context, usedTokens: 0, maxTokens: null },
    },
  });
  await usageControl(desktopApp, { usageComplete: true });
  await expect(trigger).toHaveAccessibleName('Context window unavailable');
  await expect(trigger).toHaveAttribute('aria-busy', 'false');
  await expect(dialog).not.toContainText('82,000 / 200,000 tokens');
  await expect(dialog).not.toContainText('25,000 / 100,000 tokens');
  await expect(trigger.locator('.context-ring.unknown')).toHaveCount(1);
  await usageControl(desktopApp, {
    event: { type: 'chat-usage', sessionId: 'chat-one', context: { ...context, usedTokens: 0 } },
  });
  await expect(trigger).toHaveAccessibleName('Context window: 0% used');
  await expect(trigger.locator('.context-ring.unknown')).toHaveCount(0);
  await expect(trigger.locator('.context-ring-fill')).toHaveAttribute('stroke-dashoffset', '100');
  expect(await compactCalls(desktopApp)).toBe(0);
});
