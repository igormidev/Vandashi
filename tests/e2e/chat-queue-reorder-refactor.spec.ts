import { test, expect } from './fixtures';
import {
  finishReorder,
  installQueueReorderFixture,
  queueReorderIds,
  reorderRecords,
} from './chat-queue-reorder-refactor-fixture';

test('native queue move controls submit the complete reviewed order once, stay busy through acknowledgement and preserve held drafts', async ({
  desktopApp,
  page,
}) => {
  await installQueueReorderFixture(desktopApp);
  await page.reload();
  const queue = page.getByRole('region', { name: 'Query', exact: true });
  const cards = queue.locator('.queued-message');
  await expect(cards).toHaveCount(3);
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await editor.fill('Keep my live unsent draft');
  await cards.first().hover();
  await expect(cards.first().getByRole('button', { name: 'Move up', exact: true })).toBeDisabled();
  const last = cards.nth(2);
  await last.hover();
  await expect(last.getByRole('button', { name: 'Move down', exact: true })).toBeDisabled();
  const move = last.getByRole('button', { name: 'Move up', exact: true });
  await move.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  await expect(queue).toHaveAttribute('aria-busy', 'true');
  await expect(last).toHaveAttribute('aria-busy', 'true');
  await expect(last.getByText('Loading…', { exact: true })).toBeVisible();
  await expect(last.getByRole('button', { name: 'Move up', exact: true })).toBeDisabled();
  await expect(cards.first().getByRole('button', { name: 'Remove', exact: true })).toBeDisabled();
  await expect.poll(async () => (await reorderRecords(desktopApp)).calls.length).toBe(1);
  const before = await reorderRecords(desktopApp);
  expect(before.calls).toEqual([
    {
      sessionId: 'chat-one',
      reviewedIds: queueReorderIds,
      ids: [queueReorderIds[0], queueReorderIds[2], queueReorderIds[1]],
    },
  ]);
  expect(before.sends).toBe(0);
  await finishReorder(desktopApp);
  await expect(queue).toHaveAttribute('aria-busy', 'false');
  await expect(cards.nth(1)).toContainText('Queued 3 exact request');
  await expect(cards.nth(2)).toContainText('Queued 2 exact request');
  const after = await reorderRecords(desktopApp);
  expect(after.entries.every((entry) => entry.failed)).toBe(true);
  expect(after.entries[1]).toEqual(before.entries[2]);
  expect(after.entries[2]).toEqual(before.entries[1]);
  expect(after.sends).toBe(0);
  await expect(editor).toHaveText('Keep my live unsent draft');
  await cards.nth(1).hover();
  await cards.nth(1).getByRole('button', { name: 'Move down', exact: true }).click();
  await expect.poll(async () => (await reorderRecords(desktopApp)).calls.length).toBe(2);
  await finishReorder(desktopApp);
  await expect(queue).toHaveAttribute('aria-busy', 'false');
  await expect(cards.nth(1)).toContainText('Queued 2 exact request');
  await expect(queue.getByText('Waiting for review', { exact: true })).toHaveCount(3);
});

test('native Remove explicitly permits queue resumption while Edit keeps dispatch paused through draft acknowledgement', async ({
  desktopApp,
  page,
}) => {
  await installQueueReorderFixture(desktopApp);
  await page.reload();
  const queue = page.getByRole('region', { name: 'Query', exact: true });
  const cards = queue.locator('.queued-message');
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await expect(cards).toHaveCount(3);
  await cards.first().hover();
  await cards.first().getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(queue).toHaveAttribute('aria-busy', 'true');
  await expect.poll(async () => (await reorderRecords(desktopApp)).removals.length).toBe(1);
  expect((await reorderRecords(desktopApp)).removals).toEqual([
    { sessionId: 'chat-one', id: queueReorderIds[0], resume: true },
  ]);
  await finishReorder(desktopApp);
  await expect(cards).toHaveCount(2);
  await expect(queue).toHaveAttribute('aria-busy', 'false');
  await cards.first().hover();
  await cards.first().getByRole('button', { name: 'Edit', exact: true }).click();
  await expect.poll(async () => (await reorderRecords(desktopApp)).removals.length).toBe(2);
  expect((await reorderRecords(desktopApp)).removals[1]).toEqual({
    sessionId: 'chat-one',
    id: queueReorderIds[1],
  });
  await expect(queue).toHaveAttribute('aria-busy', 'true');
  await expect(editor).toHaveText('');
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await finishReorder(desktopApp);
  await expect(cards).toHaveCount(1);
  await expect(editor).toHaveText('Queued 2 exact request');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  expect((await reorderRecords(desktopApp)).sends).toBe(0);
});
