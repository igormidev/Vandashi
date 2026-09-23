import { test, expect } from './fixtures';
import { clipRequests, installClipsFixture } from './clips-fixture';

test('plays imported clips and edits packaging without starting an absent composition', async ({
  desktopApp,
  page,
}) => {
  await installClipsFixture(desktopApp, 'none', true);
  await page.reload();
  await page.getByRole('button', { name: 'Clips', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview Finished excerpt', exact: true })).toBeEnabled();
  await page
    .locator('.clips-preview-heading')
    .getByRole('button', { name: 'Edit packaging', exact: true })
    .click();
  const preview = page.getByRole('region', { name: 'Preview', exact: true });
  const movie = preview.locator('video');
  await expect(movie).toBeVisible();
  await expect.poll(() => movie.evaluate((node: HTMLVideoElement) => node.videoWidth)).toBe(90);
  // The fixture's chroma-aligned crop is 50×90, scaled to 90×160 with SAR 80:81.
  // Chromium exposes its display dimensions (90×162), preserving the actual 5:9 display ratio.
  await expect
    .poll(() => movie.evaluate((node: HTMLVideoElement) => node.videoWidth / node.videoHeight))
    .toBeCloseTo(5 / 9, 3);
  await movie.evaluate(async (node: HTMLVideoElement) => {
    node.muted = true;
    await node.play();
  });
  await expect.poll(() => movie.evaluate((node: HTMLVideoElement) => node.currentTime)).toBeGreaterThan(0.4);
  await movie.evaluate((node: HTMLVideoElement) => {
    node.pause();
  });
  await expect(page.locator('.chat-tab.active')).toContainText('What is it about?');
  await expect(page.getByRole('button', { name: 'Return to editing', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Render video', exact: true })).toHaveCount(0);
  await expect(page.locator('hyperframes-player')).toHaveCount(0);
  const titles = page.getByRole('textbox', { name: 'Titles', exact: true });
  await expect(titles).toHaveValue('Clip short title');
  await titles.fill('Reviewed finished excerpt');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(titles).toHaveValue('Reviewed finished excerpt');
  await expect(movie).toBeVisible();
  const requests = await clipRequests(desktopApp);
  expect(requests.filter((request) => request.method === 'startStudio')).toEqual([]);
  expect(requests.filter((request) => request.method === 'createClip')).toEqual([]);
  expect(requests.filter((request) => request.method === 'sendChat')).toEqual([]);
  expect(requests.filter((request) => request.method === 'saveWorkspace').at(-1)?.input).toMatchObject({
    scope: { clipId: 'created-clip' },
    packaging: { titles: { short: ['Reviewed finished excerpt'] } },
  });
  await page.getByRole('button', { name: 'All clips', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview Finished excerpt', exact: true })).toBeVisible();
});
