import type { Page } from '@playwright/test';
import type { Locale } from '../../src/domain/locales';
import { appMessageCatalogs } from '../../src/domain/messages/catalogs';
import { interfaceCatalogs } from '../../src/renderer/locales/catalogs';
import { test, expect } from './fixtures';
import { clipRequests, finishClip, installClipsFixture } from './clips-fixture';

const direction = 'Keep 手書き and literal {{start}} unchanged.';
const instruction = (locale: Locale) =>
  appMessageCatalogs[locale].clipHandoff
    .replace('{{ratio}}', '9:16')
    .replace('{{start}}', '0')
    .replace('{{end}}', '30');

async function language(page: Page, current: Locale, next: Locale) {
  const text = interfaceCatalogs[current];
  await page.getByRole('button', { name: text.settings, exact: true }).click();
  await page.getByRole('combobox', { name: text.language, exact: true }).selectOption(next);
  await page.getByRole('dialog').getByRole('button', { name: text.save, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', next);
}

async function create(page: Page, locale: Locale, guidance = direction) {
  const text = interfaceCatalogs[locale];
  await page.getByRole('button', { name: text.clips, exact: true }).click();
  await page.getByRole('button', { name: text.createClip, exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: text.clipEnd, exact: true })).toHaveValue('30');
  await page.getByRole('textbox', { name: text.clipName, exact: true }).fill('Owned clip');
  await page.getByRole('textbox', { name: text.clipPrompt, exact: true }).fill(guidance);
  await page.getByRole('button', { name: text.createClipAction, exact: true }).click();
  await expect(page.locator('.clip-workspace-name')).toHaveText('Owned clip');
}

test('retranslates the automatic clip instruction while preserving creative direction', async ({
  desktopApp,
  page,
}) => {
  await installClipsFixture(desktopApp);
  await page.reload();
  await create(page, 'en', `${direction}\n\n- Preserve the first beat.\n- Keep the second beat readable.`);
  await expect(page.locator('.message.user')).toContainText(instruction('en'));
  await expect(page.locator('.message.user')).toContainText(direction);
  await expect(page.locator('.message.user').getByRole('listitem')).toHaveText([
    'Preserve the first beat.',
    'Keep the second beat readable.',
  ]);
  await finishClip(desktopApp);
  await expect(
    page.getByRole('button', { name: interfaceCatalogs.en.backToClips, exact: true }),
  ).toBeEnabled();
  await language(page, 'en', 'ja');
  await expect(page.locator('.message.user')).toContainText(instruction('ja'));
  await expect(page.locator('.message.user')).toContainText(direction);
  await language(page, 'ja', 'ko');
  await expect(page.locator('.message.user')).toContainText(instruction('ko'));
  await expect(page.locator('.message.user')).toContainText(direction);
  await expect(page.locator('.message.user').getByRole('listitem')).toHaveText([
    'Preserve the first beat.',
    'Keep the second beat readable.',
  ]);
});

test('localizes an explicit retry seed and keeps its descriptor after a passive language change', async ({
  desktopApp,
  page,
}) => {
  await installClipsFixture(desktopApp, 'after');
  await page.reload();
  await language(page, 'en', 'ja');
  await create(page, 'ja');
  const seed = `${instruction('ja')}\n\n${direction}`;
  await expect(
    page.getByRole('textbox', { name: interfaceCatalogs.ja.chat, exact: true }).locator('p'),
  ).toHaveText(seed.split('\n'));
  await language(page, 'ja', 'en');
  const editor = page.getByRole('textbox', { name: interfaceCatalogs.en.chat, exact: true });
  await expect(editor.locator('p')).toHaveText(seed.split('\n'));
  await page.locator('.chat-tab.active').getByRole('button', { name: 'Owned clip', exact: true }).click();
  await expect(editor.locator('p')).toHaveText(seed.split('\n'));
  await page.getByRole('button', { name: interfaceCatalogs.en.backToClips, exact: true }).click();
  await page
    .locator('.clip-row')
    .getByRole('button', { name: interfaceCatalogs.en.clipEditor, exact: true })
    .click();
  await expect(editor.locator('p')).toHaveText(seed.split('\n'));
  // A reload restores the cached draft without the transient creation receipt or ChatTarget.
  await page.reload();
  await page.getByRole('button', { name: interfaceCatalogs.en.clips, exact: true }).click();
  await page
    .locator('.clip-row')
    .getByRole('button', { name: interfaceCatalogs.en.clipEditor, exact: true })
    .click();
  await expect(editor.locator('p')).toHaveText(seed.split('\n'));
  await page.getByRole('button', { name: interfaceCatalogs.en.send, exact: true }).click();
  const submitted = (await clipRequests(desktopApp)).find((entry) => entry.method === 'sendChat');
  expect(submitted?.input).toMatchObject({
    text: seed,
    handoff: {
      message: { id: 'clipHandoff', params: { ratio: '9:16', start: 0, end: 30 } },
      guidance: direction,
    },
  });
  await expect(page.locator('.message.user')).toContainText(instruction('en'));
  await expect(page.locator('.message.user')).toContainText(direction);
  await expect(editor).toHaveText('');
});

test('preserves an edited retry draft across language changes and sends it as user content', async ({
  desktopApp,
  page,
}) => {
  await installClipsFixture(desktopApp, 'after');
  await page.reload();
  await create(page, 'en');
  const edited = `${instruction('en')}\n\n${direction}\nMy revised request.`;
  await page.getByRole('textbox', { name: interfaceCatalogs.en.chat, exact: true }).fill(edited);
  await language(page, 'en', 'ja');
  const editor = page.getByRole('textbox', { name: interfaceCatalogs.ja.chat, exact: true });
  await expect(editor.locator('p')).toHaveText(edited.split('\n'));
  await page.getByRole('button', { name: interfaceCatalogs.ja.send, exact: true }).click();
  const submitted = (await clipRequests(desktopApp)).find((entry) => entry.method === 'sendChat');
  expect(submitted?.input).toMatchObject({ text: edited });
  expect(submitted?.input).not.toHaveProperty('handoff');
  await expect(page.locator('.message.user')).toContainText(instruction('en'));
  await expect(page.locator('.message.user')).toContainText(direction);
  await expect(page.locator('.message.user')).toContainText('My revised request.');
  await expect(editor).toHaveText('');
});
