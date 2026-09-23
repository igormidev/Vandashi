import { supportedLocales } from '../../src/domain/locales';
import { appMessagesEn } from '../../src/domain/messages';
import { appMessageCatalogs } from '../../src/domain/messages/catalogs';
import { interfaceCatalogs } from '../../src/renderer/locales/catalogs';
import { test, expect } from './development-fixtures';
import { chatCalls, installChatFixture } from './chat-fixture';

test('automatic script requests retranslate after language changes and reload while genuine guidance stays verbatim', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, {
    initialMessages: [
      {
        id: 'automatic',
        role: 'user',
        turnId: 'script-turn',
        text: appMessagesEn.scriptHandoff,
        appMessage: { id: 'scriptHandoff' },
        files: [],
        createdAt: '',
      },
      {
        id: 'actual-user',
        role: 'user',
        turnId: 'user-turn',
        text: appMessagesEn.scriptHandoff,
        files: [],
        createdAt: '',
      },
    ],
  });
  await page.reload();
  let previous: (typeof supportedLocales)[number] = 'en';
  const users = page.locator('.message.user');
  for (const locale of supportedLocales) {
    if (locale !== previous) {
      const copy = interfaceCatalogs[previous];
      await page.getByRole('button', { name: copy.settings, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: copy.settings, exact: true });
      await dialog.getByRole('combobox', { name: copy.language, exact: true }).selectOption(locale);
      await dialog.getByRole('button', { name: copy.save, exact: true }).click();
      await expect(dialog).toBeHidden();
    }
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(users).toHaveCount(2);
    await expect(users.nth(0)).toHaveText(appMessageCatalogs[locale].scriptHandoff);
    await expect(users.nth(1)).toHaveText(appMessagesEn.scriptHandoff);
    await expect(page.locator('.message.receipt, .toast')).toHaveCount(0);
    await page.reload();
    await expect(users.nth(0)).toHaveText(appMessageCatalogs[locale].scriptHandoff);
    await expect(users.nth(1)).toHaveText(appMessagesEn.scriptHandoff);
    previous = locale;
  }
  expect(
    (await chatCalls(desktopApp)).filter((method) => method === 'sendChat' || method === 'saveScript'),
  ).toEqual([]);
});
