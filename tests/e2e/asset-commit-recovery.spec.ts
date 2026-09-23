import { test, expect } from './fixtures';
import {
  assetDeleteRequests,
  assetRefreshControl,
  assetSaveRequests,
  installAssetRefreshFixture,
} from './asset-refresh-fixture';

for (const video of [false, true]) {
  test(`${video ? 'video' : 'shared'} asset commit retry retains reviewed metadata and commit text`, async ({
    desktopApp,
    page,
  }) => {
    await installAssetRefreshFixture(desktopApp, video);
    await page.reload();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: video ? 'Assets' : 'Shared assets', exact: true })
      .click();
    await page.locator('.asset-tile').click();
    const title = page.getByRole('textbox', { name: 'Asset title', exact: true, includeHidden: true });
    await title.fill('Reviewed local metadata');
    await page.locator('.asset-inspector').getByRole('button', { name: 'Save changes', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('textbox', { name: 'Commit title', exact: true })
      .fill('Keep this reviewed commit title');
    await dialog
      .getByRole('textbox', { name: 'What changed', exact: true })
      .fill('Keep this reviewed description.');
    await assetRefreshControl(desktopApp, { commitFailures: 1 });
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText(/Injected Git commit failure/u)).toBeVisible();
    await expect(title).toHaveValue('Reviewed local metadata');
    await expect(dialog.getByRole('textbox', { name: 'Commit title', exact: true })).toHaveValue(
      'Keep this reviewed commit title',
    );
    await expect(dialog.getByRole('textbox', { name: 'What changed', exact: true })).toHaveValue(
      'Keep this reviewed description.',
    );
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const requests = await assetSaveRequests(desktopApp);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
  });

  test(`${video ? 'video' : 'shared'} deletion retry stays bound to the asset revision that opened confirmation`, async ({
    desktopApp,
    page,
  }) => {
    await installAssetRefreshFixture(desktopApp, video);
    await page.reload();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: video ? 'Assets' : 'Shared assets', exact: true })
      .click();
    await page.locator('.asset-tile').click();
    await page.getByRole('button', { name: 'Delete this asset?', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await assetRefreshControl(desktopApp, { commitFailures: 1 });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText(/Injected Git commit failure/u)).toBeVisible();
    await assetRefreshControl(desktopApp, { externalTitle: 'Externally replaced asset', notify: true });
    await expect(
      page.getByRole('textbox', { name: 'Asset title', exact: true, includeHidden: true }),
    ).toHaveValue('Externally replaced asset');
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText(/This asset changed outside the editor/u)).toBeVisible();
    expect((await assetDeleteRequests(desktopApp)).map((input) => input.expectedRevision)).toEqual([
      'a'.repeat(64),
      'a'.repeat(64),
    ]);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Delete this asset?', exact: true }).click();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.asset-tile')).toHaveCount(0);
    expect((await assetDeleteRequests(desktopApp)).at(-1)?.expectedRevision).toBe('b'.repeat(64));
  });
}
