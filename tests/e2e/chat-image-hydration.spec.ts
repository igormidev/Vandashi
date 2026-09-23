import { join } from 'node:path';
import { test, expect } from './fixtures';
import {
  imageHydrationStatus,
  installImageHydrationFixture,
  releaseImageHistory,
} from './chat-image-hydration-fixture';

for (const initiallyOffline of [false, true]) {
  test(`saved generated and Markdown images recover automatically after ${initiallyOffline ? 'retried offline' : 'delayed'} history grants`, async ({
    desktopApp,
    page,
  }) => {
    const path = join(process.cwd(), 'build/icon.png');
    await desktopApp.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selected] });
    }, path);
    const url = await page.evaluate(async () => {
      if (!window.vandashi) throw new Error('Missing preload');
      const [selected] = await window.vandashi.chooseFiles('images');
      if (!selected) throw new Error('Missing selected image');
      return window.vandashi.mediaUrl(selected);
    });
    // The delayed IPC permission gate is deterministic; image decoding uses the production media protocol.
    await installImageHydrationFixture(desktopApp, path, url);
    await page.reload();
    await expect.poll(async () => (await imageHydrationStatus(desktopApp)).pending).toBe(true);
    await expect(page.getByText('Saved conversation one', { exact: true })).toBeVisible();
    const draft = page.getByRole('textbox', { name: 'AI chat', exact: true });
    await draft.fill('Keep this unsent thumbnail request');
    await expect(page.getByText('Image unavailable', { exact: true })).toHaveCount(2);
    expect((await imageHydrationStatus(desktopApp)).rejectedLookups).toBeGreaterThanOrEqual(2);

    if (initiallyOffline) {
      await releaseImageHistory(desktopApp, false);
      await expect(page.locator('.chat-retry')).toBeVisible();
      await expect(draft).toHaveText('Keep this unsent thumbnail request');
      await expect(page.getByText('Saved conversation one', { exact: true })).toBeVisible();
      expect((await imageHydrationStatus(desktopApp)).opens).toBe(1);
      await page.locator('.chat-retry').getByRole('button', { name: 'Check again', exact: true }).click();
      await expect.poll(async () => (await imageHydrationStatus(desktopApp)).opens).toBe(2);
      await expect.poll(async () => (await imageHydrationStatus(desktopApp)).pending).toBe(true);
    }

    await releaseImageHistory(desktopApp, true);
    for (const name of ['Generated image', 'Saved thumbnail']) {
      const image = page.getByRole('img', { name, exact: true });
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1024);
    }
    await expect(page.getByText('Image unavailable', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry image', exact: true })).toHaveCount(0);
    await expect(draft).toHaveText('Keep this unsent thumbnail request');
    await expect(page.locator('.chat-tab.active')).toContainText('Brand attributes');
    await page.getByRole('button', { name: 'Inspect Generated image', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Generated image', exact: true })).toBeVisible();
  });
}

test('a chat opened during Studio startup hydrates its cached history when idle without losing the draft', async ({
  desktopApp,
  page,
}) => {
  const path = join(process.cwd(), 'build/icon.png');
  await desktopApp.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selected] });
  }, path);
  const url = await page.evaluate(async () => {
    if (!window.vandashi) throw new Error('Missing preload');
    const [selected] = await window.vandashi.chooseFiles('images');
    if (!selected) throw new Error('Missing selected image');
    return window.vandashi.mediaUrl(selected);
  });
  await installImageHydrationFixture(desktopApp, path, url, 'studio');
  await page.reload();
  await expect(page.locator('.chat-tab.active')).toContainText('Titles · long form');
  await page.getByRole('navigation').getByRole('button', { name: 'Creation workspace', exact: true }).click();
  await expect.poll(async () => (await imageHydrationStatus(desktopApp)).studioPending).toBe(true);
  await page.getByRole('button', { name: 'AI chat', exact: true }).click();
  await expect(page.locator('.chat-tab.active')).toContainText('Creation workspace');
  await expect.poll(async () => (await imageHydrationStatus(desktopApp)).cachedOpens).toBe(1);
  await expect(page.getByText('Image unavailable', { exact: true })).toHaveCount(2);
  expect((await imageHydrationStatus(desktopApp)).pending).toBe(false);
  const opens = (await imageHydrationStatus(desktopApp)).opens;
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('vandashi:image-studio-release');
  });
  await expect.poll(async () => (await imageHydrationStatus(desktopApp)).pending).toBe(true);
  const draft = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await draft.fill('Retain this while the provider history loads');
  await releaseImageHistory(desktopApp, true);
  const generated = page.getByRole('img', { name: 'Generated image', exact: true });
  await expect(generated).toBeVisible();
  await expect.poll(() => generated.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1024);
  await expect(page.getByRole('img', { name: 'Saved thumbnail', exact: true })).toBeVisible();
  await expect(page.getByText('Image unavailable', { exact: true })).toHaveCount(0);
  await expect(draft).toHaveText('Retain this while the provider history loads');
  await expect(page.locator('.chat-tab.active')).toContainText('Creation workspace');
  expect((await imageHydrationStatus(desktopApp)).opens).toBe(opens + 1);
});

test('history retries once when the idle event arrives before its deferred response', async ({
  desktopApp,
  page,
}) => {
  const path = join(process.cwd(), 'build/icon.png');
  await desktopApp.evaluate(({ dialog }, selected) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selected] });
  }, path);
  const url = await page.evaluate(async () => {
    if (!window.vandashi) throw new Error('Missing preload');
    const [selected] = await window.vandashi.chooseFiles('images');
    if (!selected) throw new Error('Missing selected image');
    return window.vandashi.mediaUrl(selected);
  });
  await installImageHydrationFixture(desktopApp, path, url, 'late-idle');
  await page.reload();
  const draft = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await expect.poll(async () => (await imageHydrationStatus(desktopApp)).cachedOpens).toBe(1);
  await expect(draft).toBeDisabled();
  await desktopApp.evaluate(({ ipcMain }) => {
    ipcMain.emit('vandashi:image-hydration-idle');
  });
  await expect(draft).toBeEnabled();
  await draft.fill('Keep this draft through the delayed cached response');
  expect((await imageHydrationStatus(desktopApp)).opens).toBe(1);
  await releaseImageHistory(desktopApp, true);
  await expect.poll(async () => (await imageHydrationStatus(desktopApp)).opens).toBe(2);
  await expect.poll(async () => (await imageHydrationStatus(desktopApp)).pending).toBe(true);
  await expect(page.getByText('Image unavailable', { exact: true })).toHaveCount(2);
  await releaseImageHistory(desktopApp, true);
  await expect(page.getByRole('img', { name: 'Generated image', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Saved thumbnail', exact: true })).toBeVisible();
  await expect(draft).toHaveText('Keep this draft through the delayed cached response');
  expect((await imageHydrationStatus(desktopApp)).opens).toBe(2);
});
