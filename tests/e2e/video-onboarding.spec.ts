import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from './development-fixtures';
import { installVideoListFixture, videoListControl, videoListObservation } from './video-list-fixture';

async function onboarding(desktop: ElectronApplication, page: Page) {
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Videos', exact: true }).click();
  await expect.poll(async () => (await videoListObservation(desktop)).pendingLists).toBe(1);
  await videoListControl(desktop, { list: 'first' });
  await page.getByRole('button', { name: 'New video', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(async () => (await videoListObservation(desktop)).pendingLists).toBe(1);
  await videoListControl(desktop, { list: 'first' });
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Saved project');
}

test('saved video with failed hydration returns to a refreshed library and reopens without creating again', async ({
  desktopApp,
  page,
}) => {
  await installVideoListFixture(desktopApp, { creation: 'saved-error' });
  await onboarding(desktopApp, page);
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await videoListObservation(desktopApp)).pendingLists).toBe(1);
  await videoListControl(desktopApp, { list: 'first' });
  await expect(page.getByRole('heading', { name: 'Saved project', exact: true })).toBeVisible();
  await page
    .getByRole('button')
    .filter({ has: page.getByRole('heading', { name: 'Saved project', exact: true }) })
    .click();
  await expect(page.getByRole('textbox', { name: 'What is it about?', exact: true })).toBeVisible();
  expect((await videoListObservation(desktopApp)).created).toEqual([
    { name: 'Saved project', ratio: '16:9' },
  ]);
  expect((await videoListObservation(desktopApp)).opened.at(-1)?.videoId).toBe('saved-video');
});

test('failure before creation preserves onboarding values and does not advertise a saved video', async ({
  desktopApp,
  page,
}) => {
  await installVideoListFixture(desktopApp, { creation: 'before-error' });
  await onboarding(desktopApp, page);
  const lists = (await videoListObservation(desktopApp)).lists;
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue('Saved project');
  await expect(page.locator('.toast')).toContainText('Creation preparation failed');
  await expect(page.locator('.toast')).toBeVisible();
  expect((await videoListObservation(desktopApp)).lists).toBe(lists);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved project', exact: true })).toHaveCount(0);
});

for (const ratio of ['16:9', '9:16'] as const) {
  test(`onboarding exposes and creates the selected ${ratio} format`, async ({ desktopApp, page }) => {
    await installVideoListFixture(desktopApp, { creation: 'success' });
    await onboarding(desktopApp, page);
    const formats = page.getByRole('group', { name: 'Format', exact: true });
    const horizontal = formats.getByRole('button', { name: /Landscape/ });
    const vertical = formats.getByRole('button', { name: /Portrait/ });
    await expect(horizontal).toHaveAttribute('aria-pressed', 'true');
    await expect(vertical).toHaveAttribute('aria-pressed', 'false');
    if (ratio === '9:16') {
      await vertical.focus();
      await page.keyboard.press('Enter');
    }
    await expect(horizontal).toHaveAttribute('aria-pressed', String(ratio === '16:9'));
    await expect(vertical).toHaveAttribute('aria-pressed', String(ratio === '9:16'));
    await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await videoListObservation(desktopApp)).created).toEqual([{ name: 'Saved project', ratio }]);
    const clips = page.getByRole('navigation').getByRole('button', { name: 'Clips', exact: true });
    if (ratio === '9:16') await expect(clips).toHaveCount(0);
    else await expect(clips).toBeVisible();
  });
}
