import { test, expect } from './fixtures';
import { chatCalls, installChatFixture } from './chat-fixture';
import { appMessagesEn } from '../../src/domain/messages';

for (const mode of ['edit', 'legacy', 'read'] as const) {
  test(`publishing ${mode} checkpoints expose the appropriate undo control`, async ({ desktopApp, page }) => {
    await installChatFixture(desktopApp, true, {
      publishCheckpoints: [
        {
          turnId: 'publication-turn',
          threadId: 'publication-thread',
          heads: {},
          postHeads: {},
          messageCount: 0,
          ...(mode === 'legacy' ? {} : { mode }),
        },
      ],
    });
    await page.reload();
    await page.getByRole('button', { name: 'Launch suite', exact: true }).click();
    await page
      .locator('.launch-row')
      .filter({ has: page.getByRole('heading', { name: 'YouTube', exact: true }) })
      .getByRole('button', { name: 'Prepare upload', exact: true })
      .click();
    await page.getByRole('button', { name: 'Open upload chat', exact: true }).click();
    const undo = page.getByRole('button', { name: 'Revert last change', exact: true });
    if (mode === 'read') await expect(undo).toBeEnabled();
    else {
      await expect(undo).toBeDisabled();
      await undo.focus();
      await expect(page.getByRole('tooltip')).toHaveText(appMessagesEn.appPublishUndoUnavailable);
      await undo.press('Enter');
      await undo.press('Space');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    expect((await chatCalls(desktopApp)).filter((call) => call === 'undoChat')).toHaveLength(0);
  });
}
