import { join } from 'node:path';
import { test, expect } from './fixtures';
import { chatCalls, installChatFixture } from './chat-fixture';

test('tracks each clip release and opens the selected clip publishing conversation', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, true, { clips: true });
  await page.reload();
  await expect(
    page
      .getByRole('button', { name: 'Launch suite', exact: true })
      .or(page.getByRole('heading', { name: 'Brand attributes', exact: true })),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Launch suite', exact: true }).click();
  const status = page.getByRole('combobox', { name: 'YouTube Shorts · First excerpt Status', exact: true });
  await status.selectOption('uploaded');
  await expect(status).toHaveValue('uploaded');
  const url = page.getByRole('textbox', {
    name: 'YouTube Shorts · First excerpt Published video URL',
    exact: true,
  });
  await url.fill('https://youtube.com/shorts/fixture');
  await url.press('Tab');
  await expect(url).toHaveValue('https://youtube.com/shorts/fixture');
  await expect(
    page.getByRole('combobox', { name: 'TikTok · First excerpt Status', exact: true }),
  ).toHaveValue('not_started');
  await status.selectOption('not_started');
  await expect(status).toHaveValue('not_started');
  await page
    .locator('.clip-release')
    .filter({ has: status })
    .getByRole('button', { name: 'Prepare upload', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveValue('Clip short title');
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue(
    'Clip description',
  );
  await page.getByRole('button', { name: 'Open upload chat', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveText(
    'Prepared upload request 1',
  );
  expect((await chatCalls(desktopApp)).filter((call) => call === 'sendChat')).toHaveLength(0);
});

test('offers create and import actions when no clips exist and uses imported clip packaging', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, true);
  await page.reload();
  await expect(
    page
      .getByRole('button', { name: 'Launch suite', exact: true })
      .or(page.getByRole('heading', { name: 'Brand attributes', exact: true })),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Launch suite', exact: true }).click();
  const shorts = page
    .locator('.launch-platform-group')
    .filter({ has: page.getByRole('heading', { name: 'YouTube Shorts', exact: true }) });
  await shorts.getByRole('button', { name: 'Choose a clip', exact: true }).click();
  await expect(page.getByText('Create a clip or import a finished video.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create a clip', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clips', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Launch suite', exact: true }).click();
  await shorts.getByRole('button', { name: 'Choose a clip', exact: true }).click();
  await page.getByRole('button', { name: 'Import a video', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveValue('Clip short title');
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue(
    'Clip description',
  );
});

test('validates manually edited chapters against an actual decoded video and preserves review fields', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, true, {
    mediaPath: join(process.cwd(), 'tests/fixtures/chapter-video.mp4'),
  });
  await page.reload();
  await expect(
    page
      .getByRole('button', { name: 'Launch suite', exact: true })
      .or(page.getByRole('heading', { name: 'Brand attributes', exact: true })),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Launch suite', exact: true }).click();
  await page
    .locator('.launch-row')
    .filter({ has: page.getByRole('heading', { name: 'YouTube', exact: true }) })
    .getByRole('button', { name: 'Prepare upload', exact: true })
    .click();
  await page.getByRole('textbox', { name: 'Titles', exact: true }).fill('My reviewed title');
  await page.getByRole('button', { name: 'Generate chapters', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Chapters', exact: true });
  const save = dialog.getByRole('button', { name: 'Save changes', exact: true });
  await expect(save).toBeEnabled();
  await dialog.getByRole('spinbutton', { name: 'Chapter 3 start in seconds', exact: true }).fill('59');
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('ten seconds');
  await dialog.getByRole('spinbutton', { name: 'Chapter 3 start in seconds', exact: true }).fill('40');
  await dialog.getByRole('textbox', { name: 'Chapter 3 title', exact: true }).fill('My ending');
  await save.click();
  await expect(page.getByText('My ending', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open upload chat', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveValue('My reviewed title');
});

test('shows only short-form destinations for a portrait main video', async ({ desktopApp, page }) => {
  await installChatFixture(desktopApp, true, { portrait: true });
  await page.reload();
  await expect(
    page
      .getByRole('button', { name: 'Launch suite', exact: true })
      .or(page.getByRole('heading', { name: 'Brand attributes', exact: true })),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Launch suite', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Short form', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Long form', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'YouTube', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'YouTube Shorts Status', exact: true })).toBeVisible();
});
