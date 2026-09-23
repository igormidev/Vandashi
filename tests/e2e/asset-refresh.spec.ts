import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { assetRefreshControl, assetRefreshStatus, installAssetRefreshFixture } from './asset-refresh-fixture';

async function settleFrames(page: Page, focus = false) {
  await page.evaluate(async (sendFocus) => {
    for (let frame = 0; frame < 4; frame++) {
      if (sendFocus) window.dispatchEvent(new Event('focus'));
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    }
  }, focus);
}

for (const video of [false, true]) {
  test(`${video ? 'video' : 'shared'} assets bound refresh requests and preserve typed metadata through focus and late reads`, async ({
    desktopApp,
    page,
  }) => {
    await installAssetRefreshFixture(desktopApp, video);
    await page.reload();
    const tab = page
      .getByRole('navigation')
      .getByRole('button', { name: video ? 'Assets' : 'Shared assets', exact: true });
    await expect(tab).toBeEnabled();
    await assetRefreshControl(desktopApp, { hold: true });
    await tab.click();
    await expect.poll(async () => (await assetRefreshStatus(desktopApp)).pending).toBe(1);
    const entryReads = (await assetRefreshStatus(desktopApp)).reads;
    await settleFrames(page, true);
    expect(await assetRefreshStatus(desktopApp)).toEqual({ reads: entryReads, pending: 1 });
    await page.locator('.asset-tile').click();
    const title = page.getByRole('textbox', { name: 'Asset title', exact: true });
    await expect(title).toBeDisabled();
    await assetRefreshControl(desktopApp, { release: true });
    await settleFrames(page);
    expect(await assetRefreshStatus(desktopApp)).toEqual({ reads: entryReads, pending: 0 });
    await expect(title).toBeEnabled();
    await settleFrames(page, true);
    expect(await assetRefreshStatus(desktopApp)).toEqual({ reads: entryReads + 1, pending: 1 });
    await assetRefreshControl(desktopApp, { release: true });
    await expect(title).toBeEnabled();
    await title.fill('');
    await title.pressSequentially('Orbit identity');
    await settleFrames(page, true);
    await expect(title).toHaveValue('Orbit identity');
    expect(await assetRefreshStatus(desktopApp)).toEqual({ reads: entryReads + 1, pending: 0 });
    await expect(
      page.locator('.asset-inspector').getByRole('button', { name: 'Save changes', exact: true }),
    ).toBeEnabled();
    await assetRefreshControl(desktopApp, { externalTitle: 'External logo' });
    await expect(title).toBeDisabled();
    await expect.poll(async () => (await assetRefreshStatus(desktopApp)).pending).toBe(1);
    await assetRefreshControl(desktopApp, { release: true });
    await expect(title).toBeEnabled();
    await expect(title).toHaveValue('Orbit identity');
    await expect(page.getByRole('button', { name: 'Refresh assets', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Reset details', exact: true }).click();
    await expect(title).toHaveValue('External logo');
    await settleFrames(page);
    expect(await assetRefreshStatus(desktopApp)).toEqual({ reads: entryReads + 2, pending: 0 });
  });
}
