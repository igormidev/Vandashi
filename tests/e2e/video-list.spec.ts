import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from './development-fixtures';
import { installVideoListFixture, videoListControl, videoListObservation } from './video-list-fixture';

async function openVideos(desktop: ElectronApplication, page: Page) {
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Videos', exact: true }).click();
  await expect.poll(async () => (await videoListObservation(desktop)).lists).toBe(1);
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Loading…');
  await expect(page.getByText('Make room for your next idea.', { exact: true })).toHaveCount(0);
}

test('video list distinguishes loading, persistent failure, retry, and a verified empty result', async ({
  desktopApp,
  page,
}) => {
  await installVideoListFixture(desktopApp);
  await openVideos(desktopApp, page);
  await expect(page.getByRole('button', { name: 'New video', exact: true })).toBeDisabled();
  await videoListControl(desktopApp, { list: 'fail' });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Video library is temporarily unavailable');
  await expect(page.getByText('Make room for your next idea.', { exact: true })).toHaveCount(0);
  await alert.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect.poll(async () => (await videoListObservation(desktopApp)).lists).toBe(2);
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Loading…');
  await videoListControl(desktopApp, { list: 'first' });
  await expect(page.getByRole('heading', { name: 'Review video', exact: true })).toBeVisible();
  await expect(alert).toHaveCount(0);
  await videoListControl(desktopApp, { refresh: { empty: true } });
  await expect.poll(async () => (await videoListObservation(desktopApp)).pendingLists).toBe(1);
  await expect(page.getByRole('heading', { name: 'Review video', exact: true })).toHaveCount(0);
  await videoListControl(desktopApp, { list: 'first' });
  await expect(page.getByText('Make room for your next idea.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New video', exact: true })).toBeEnabled();
});

test('a late superseded video list cannot replace the current snapshot', async ({ desktopApp, page }) => {
  await installVideoListFixture(desktopApp);
  await openVideos(desktopApp, page);
  await videoListControl(desktopApp, { refresh: { empty: true } });
  await expect.poll(async () => (await videoListObservation(desktopApp)).pendingLists).toBe(2);
  await videoListControl(desktopApp, { list: 'last' });
  await expect(page.getByText('Make room for your next idea.', { exact: true })).toBeVisible();
  await videoListControl(desktopApp, { list: 'first' });
  await expect(page.getByText('Make room for your next idea.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review video', exact: true })).toHaveCount(0);
});

test('video thumbnails reject stale grants and reset after removal, missing files, and decode failure', async ({
  desktopApp,
  page,
}) => {
  const root = '/tmp/chat-test/videos/video/';
  const image = (color: string) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="${color}"/></svg>`)}`;
  const old = image('red');
  const current = image('green');
  await installVideoListFixture(desktopApp, { thumbnail: 'old.png' });
  await openVideos(desktopApp, page);
  await videoListControl(desktopApp, { list: 'first' });
  await expect
    .poll(async () => (await videoListObservation(desktopApp)).pendingThumbnails)
    .toEqual([`${root}old.png`]);
  await videoListControl(desktopApp, { refresh: { thumbnail: 'new.png' } });
  await expect.poll(async () => (await videoListObservation(desktopApp)).pendingLists).toBe(1);
  await videoListControl(desktopApp, { list: 'first' });
  await expect
    .poll(async () => (await videoListObservation(desktopApp)).pendingThumbnails)
    .toEqual([`${root}old.png`, `${root}new.png`]);
  await videoListControl(desktopApp, { thumbnail: { path: `${root}new.png`, url: current } });
  const cover = page.locator('.video-cover');
  await expect(cover.locator('img')).toHaveAttribute('src', current);
  await expect
    .poll(() => cover.locator('img').evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(24);
  await videoListControl(desktopApp, { thumbnail: { path: `${root}old.png`, url: old } });
  await expect(cover.locator('img')).toHaveAttribute('src', current);
  await videoListControl(desktopApp, { refresh: { thumbnail: null } });
  await expect(page.locator('.video-cover img')).toHaveCount(0);
  await expect.poll(async () => (await videoListObservation(desktopApp)).pendingLists).toBe(1);
  await videoListControl(desktopApp, { list: 'first' });
  await expect(cover.locator('svg')).toBeVisible();
  for (const failure of ['missing', 'decode'] as const) {
    await videoListControl(desktopApp, { refresh: { thumbnail: `${failure}.png` } });
    await expect.poll(async () => (await videoListObservation(desktopApp)).pendingLists).toBe(1);
    await videoListControl(desktopApp, { list: 'first' });
    await expect
      .poll(async () => (await videoListObservation(desktopApp)).pendingThumbnails)
      .toEqual([`${root}${failure}.png`]);
    await videoListControl(desktopApp, {
      thumbnail: { path: `${root}${failure}.png`, fail: failure === 'missing', url: 'data:image/png,broken' },
    });
    await expect(cover.locator('img')).toHaveCount(0);
    await expect(cover.locator('svg')).toBeVisible();
  }
});

test('long video names fit the minimum window while themes expand and the correct project opens', async ({
  desktopApp,
  page,
}) => {
  const name = 'W'.repeat(100);
  await installVideoListFixture(desktopApp, {
    name,
    theme: 'A long description of the video theme and the story it explores. '.repeat(30),
  });
  await openVideos(desktopApp, page);
  await videoListControl(desktopApp, { list: 'first' });
  const tile = page.locator('.video-grid > .video-tile');
  await expect(tile.getByRole('heading', { name, exact: true })).toBeVisible();
  expect(await tile.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await tile.getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(tile.getByRole('button', { name: 'Show less', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await tile.getByRole('button', { name: 'Show less', exact: true }).click();
  await page.screenshot({ path: '/tmp/vandashi-video-list-minimum.png' });
  await tile.getByRole('button', { name, exact: true }).click();
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Packaging', exact: true }),
  ).toBeVisible();
  expect((await videoListObservation(desktopApp)).opened).toContainEqual({
    brandId: 'chat-brand',
    videoId: 'chat-video',
    clipId: null,
  });
});

for (const destination of ['Home', 'Brand'] as const) {
  test(`a delayed video open cannot reopen the project after navigation to ${destination}`, async ({
    desktopApp,
    page,
  }) => {
    await installVideoListFixture(desktopApp, { delayOpen: true });
    await openVideos(desktopApp, page);
    await videoListControl(desktopApp, { list: 'first' });
    await page.getByRole('button', { name: 'Review video', exact: true }).click();
    await expect.poll(async () => (await videoListObservation(desktopApp)).pendingOpens).toBe(1);
    if (destination === 'Home') await page.getByRole('button', { name: 'Vandashi', exact: true }).click();
    else await page.getByRole('navigation').getByRole('button', { name: 'Brand', exact: true }).click();
    const destinationContent =
      destination === 'Home'
        ? page.locator('.home')
        : page.getByRole('textbox', { name: 'Name', exact: true });
    await expect(destinationContent).toBeVisible();
    await videoListControl(desktopApp, { open: 'success' });
    // Let the resolved IPC response and its React update cross both browser rendering frames.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        }),
    );
    await expect(destinationContent).toBeVisible();
    await expect(
      page.getByRole('navigation').getByRole('button', { name: 'Packaging', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('video selection serializes repeated clicks and keeps a failed open retryable', async ({
  desktopApp,
  page,
}) => {
  await installVideoListFixture(desktopApp, { delayOpen: true, secondVideo: true });
  await openVideos(desktopApp, page);
  await videoListControl(desktopApp, { list: 'first' });
  const first = page.getByRole('button', { name: 'Review video', exact: true });
  const second = page.getByRole('button', { name: 'Another video', exact: true });
  await first.click();
  await expect(first).toBeDisabled();
  await expect(second).toBeDisabled();
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Loading…');
  await first.evaluate((element: HTMLButtonElement) => {
    element.click();
  });
  await second.evaluate((element: HTMLButtonElement) => {
    element.click();
  });
  expect((await videoListObservation(desktopApp)).opened).toHaveLength(1);
  await videoListControl(desktopApp, { open: 'fail' });
  await expect(page.getByRole('alert')).toContainText('Video workspace is temporarily unavailable');
  await expect(first).toBeEnabled();
  await expect(second).toBeEnabled();
  await page.getByRole('alert').getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(first).toBeDisabled();
  await expect.poll(async () => (await videoListObservation(desktopApp)).opened.length).toBe(2);
  expect((await videoListObservation(desktopApp)).opened.map((scope) => scope.videoId)).toEqual([
    'chat-video',
    'chat-video',
  ]);
  await videoListControl(desktopApp, { open: 'success' });
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Packaging', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
