import { join } from 'node:path';
import { copyFile, unlink } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { chatCalls, chatControl, installChatFixture } from './chat-fixture';

test('shows authorized generated and Markdown images, opens uncropped inspection, and handles unavailable files', async ({
  desktopApp,
  page,
}) => {
  const path = join(process.cwd(), 'build/icon.png');
  await desktopApp.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selected] });
  }, path);
  const url = await page.evaluate(async () => {
    if (!window.vandashi) throw new Error('Missing preload');
    const [path] = await window.vandashi.chooseFiles('images');
    if (!path) throw new Error('Missing native image selection');
    return window.vandashi.mediaUrl(path);
  });
  // AI/session fixture, but the image keeps its actual native grant and production media protocol.
  await installChatFixture(desktopApp, false, { chatMediaUrls: { [path]: url } });
  await page.reload();
  await expect(page.getByText('Saved conversation one', { exact: true })).toBeVisible();
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: {
        id: 'image-generation',
        role: 'tool',
        text: 'Image completed',
        turnId: 't1',
        files: [],
        createdAt: '',
        generatedImages: [path, '/unselected/private.png'],
      },
    },
  });
  const generated = page.getByRole('img', { name: 'Generated image', exact: true });
  await expect(generated).toBeVisible();
  await expect.poll(() => generated.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1024);
  await expect(page.getByText('Image unavailable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect Generated image', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Generated image', exact: true });
  await expect(dialog.getByRole('img', { name: 'Generated image', exact: true })).toHaveCSS(
    'object-fit',
    'contain',
  );
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: {
        id: 'image-answer',
        role: 'assistant',
        text: `Saved: ![Saved thumbnail](<${path}>)\n\n![Remote image](https://example.com/tracking.png)`,
        turnId: 't1',
        files: [],
        createdAt: '',
      },
    },
  });
  const thumbnail = page.getByRole('img', { name: 'Saved thumbnail', exact: true });
  await expect(thumbnail).toBeVisible();
  await expect.poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1024);
  await expect(page.getByRole('img', { name: 'Remote image', exact: true })).toHaveCount(0);
  await expect(page.getByText('Image unavailable', { exact: true })).toHaveCount(2);
  // Rejected remote URLs do not receive an action that could fetch them later.
  await expect(page.getByRole('button', { name: 'Retry image', exact: true })).toHaveCount(1);
});

test('retries an unavailable granted image through the production media protocol after it returns', async ({
  desktopApp,
  page,
  userData,
}) => {
  const original = join(process.cwd(), 'build/icon.png');
  const path = join(userData, 'recoverable-image.png');
  await copyFile(original, path);
  await desktopApp.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selected] });
  }, path);
  const url = await page.evaluate(async () => {
    if (!window.vandashi) throw new Error('Missing preload');
    const [path] = await window.vandashi.chooseFiles('images');
    if (!path) throw new Error('Missing native image selection');
    return window.vandashi.mediaUrl(path);
  });
  await unlink(path);
  await installChatFixture(desktopApp, false, { chatMediaUrls: { [path]: url } });
  await page.reload();
  await expect(page.getByText('Saved conversation one', { exact: true })).toBeVisible();
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: {
        id: 'recoverable-image',
        role: 'tool',
        text: 'Image completed',
        turnId: 't1',
        files: [],
        createdAt: '',
        generatedImages: [path],
      },
    },
  });
  const retry = page.getByRole('button', { name: 'Retry image', exact: true });
  await expect(retry).toBeVisible();
  const callsBefore = (await chatCalls(desktopApp)).filter((call) => call === 'mediaUrl').length;
  await retry.click();
  await expect(retry).toBeVisible();
  expect((await chatCalls(desktopApp)).filter((call) => call === 'mediaUrl')).toHaveLength(callsBefore + 1);
  await copyFile(original, path);
  await retry.click();
  const image = page.getByRole('img', { name: 'Generated image', exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1024);
  await expect(retry).toHaveCount(0);
  expect((await chatCalls(desktopApp)).filter((call) => call === 'mediaUrl')).toHaveLength(callsBefore + 2);
});
