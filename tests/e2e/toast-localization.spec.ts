import type { Page } from '@playwright/test';
import type { AppEvent } from '../../src/domain/models';
import { appMessageCatalogs } from '../../src/domain/messages/catalogs';
import { interfaceCatalogs } from '../../src/renderer/locales/catalogs';
import { test, expect } from './fixtures';
import { chatCalls, chatControl, installChatFixture } from './chat-fixture';

async function changeLanguage(page: Page, from: 'en' | 'ja', to: 'en' | 'ja') {
  const text = interfaceCatalogs[from];
  await page.getByRole('button', { name: text.settings, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: text.settings, exact: true });
  await dialog.getByRole('combobox', { name: text.language, exact: true }).selectOption(to);
  await dialog.getByRole('button', { name: text.save, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('lang', to);
}

test('language changes update a visible UI toast without restarting its dismissal or checks', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, { checksFail: true });
  await page.clock.install({ time: new Date('2026-09-23T00:00:00Z') });
  await page.reload();
  await expect(page.getByRole('button', { name: interfaceCatalogs.en.retry, exact: true })).toBeVisible();
  await page.clock.pauseAt(new Date('2026-09-23T01:00:00Z'));
  await page.getByRole('button', { name: interfaceCatalogs.en.retry, exact: true }).click();
  const toast = page.locator('.toast');
  await expect(toast).toHaveText(interfaceCatalogs.en.checkStillMissing);
  const checks = (await chatCalls(desktopApp)).filter((call) => call === 'checks').length;
  await page.clock.runFor(4000);
  await changeLanguage(page, 'en', 'ja');
  await expect(toast).toHaveText(interfaceCatalogs.ja.checkStillMissing);
  expect((await chatCalls(desktopApp)).filter((call) => call === 'checks')).toHaveLength(checks);
  await page.clock.runFor(2499);
  await expect(toast).toHaveText(interfaceCatalogs.ja.checkStillMissing);
  await page.clock.runFor(1);
  await expect(toast).toHaveCount(0);
});

test('saved receipts and typed notices retranslate while duplicate receipts and raw notices retain their meaning', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp);
  await page.clock.install({ time: new Date('2026-09-23T00:00:00Z') });
  await page.reload();
  await expect(page.getByText('Saved conversation one', { exact: true })).toBeVisible();
  await page.clock.pauseAt(new Date('2026-09-23T01:00:00Z'));
  const receipt: AppEvent = {
    type: 'chat',
    sessionId: 'chat-one',
    delta: false,
    message: {
      id: 'receipt:thread-one:localized-turn',
      role: 'tool',
      text: 'Provider text is not the receipt label.',
      appMessage: { id: 'turnSaved' },
      turnId: 'localized-turn',
      files: [{ path: '/project/script.md', additions: 1, deletions: 0, diff: '+Opening' }],
      createdAt: '',
    },
  };
  await chatControl(desktopApp, { event: receipt });
  const toast = page.locator('.toast');
  await expect(toast).toHaveText(appMessageCatalogs.en.turnSaved);
  await changeLanguage(page, 'en', 'ja');
  await expect(toast).toHaveText(appMessageCatalogs.ja.turnSaved);
  await toast.getByRole('button', { name: interfaceCatalogs.ja.dismiss, exact: true }).click();
  await chatControl(desktopApp, { event: receipt });
  await expect(toast).toHaveCount(0);

  const raw = 'Provider detail: /tmp/制作 & clips/start.js\nThe video studio did not start.';
  await chatControl(desktopApp, {
    event: {
      type: 'notice',
      code: 'typed-notice',
      detail: 'Fallback text is not the diagnostic.',
      diagnostic: { kind: 'app', message: { id: 'mediaStudioStartFailed' }, externalDetail: raw },
    },
  });
  const detail = toast.locator(':scope > span');
  await expect
    .poll(() => detail.textContent())
    .toBe(`${appMessageCatalogs.ja.mediaStudioStartFailed}\n${raw}`);
  await changeLanguage(page, 'ja', 'en');
  await expect
    .poll(() => detail.textContent())
    .toBe(`${appMessageCatalogs.en.mediaStudioStartFailed}\n${raw}`);

  await chatControl(desktopApp, { event: { type: 'notice', code: 'raw-notice', detail: raw } });
  await expect.poll(() => detail.textContent()).toBe(raw);
  await changeLanguage(page, 'en', 'ja');
  await expect.poll(() => detail.textContent()).toBe(raw);
});
