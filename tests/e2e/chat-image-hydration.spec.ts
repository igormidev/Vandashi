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
    await expect(page.locator('.chat-tab.active')).toContainText('First chat');
    await page.getByRole('button', { name: 'Inspect Generated image', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Generated image', exact: true })).toBeVisible();
  });
}
