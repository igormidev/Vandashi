import { mkdir, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from './fixtures';
import { brandRecoveryControl, brandRecoveryStatus, installBrandRecovery } from './brand-recovery-fixture';

test('retains the first-brand form through missing Git, installation help, and a held retry', async ({
  desktopApp,
  page,
  userData,
}) => {
  const directory = join(userData, 'Chosen parent');
  await mkdir(directory);
  await installBrandRecovery(desktopApp, directory, {
    kind: 'app',
    message: { id: 'gitUnavailable' },
    externalDetail: 'Executable lookup failed: ENOENT.',
  });
  await page.reload();
  await page.getByRole('button', { name: 'Create a brand', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a brand', exact: true });
  const name = dialog.getByRole('textbox', { name: 'Brand name', exact: true });
  await name.fill('First brand');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Git is unavailable.');
  await expect(dialog.getByRole('alert')).toContainText('Executable lookup failed: ENOENT.');
  await expect(dialog).not.toContainText('VANDASHI_DIAGNOSTIC');
  await expect(name).toHaveValue('First brand');
  expect(await readdir(directory)).toEqual([]);
  await dialog.getByRole('button', { name: 'Installation guide', exact: true }).click();
  expect((await brandRecoveryStatus(desktopApp)).links).toEqual(['https://git-scm.com/downloads']);
  await dialog.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Check again', exact: true })).toBeEnabled();
  expect(await readdir(directory)).toEqual([]);
  await brandRecoveryControl(desktopApp, 'ready');
  await dialog.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect.poll(async () => (await brandRecoveryStatus(desktopApp)).pending).toBe(true);
  await expect(name).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Loading…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(await readdir(directory)).toEqual([]);
  await brandRecoveryControl(desktopApp, 'release');
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Brand', exact: true }),
  ).toBeEnabled();
  const status = await brandRecoveryStatus(desktopApp);
  const canonical = await realpath(directory);
  expect(status.creates).toEqual(
    Array.from({ length: 3 }, () => ({ parentPath: canonical, name: 'First brand' })),
  );
  expect(status.pickers).toBe(1);
  expect(await readdir(directory)).toEqual(['First brand']);
});

test('retains raw external creation failures without misclassifying their words as missing Git', async ({
  desktopApp,
  page,
  userData,
}) => {
  const directory = join(userData, 'External failure parent');
  await mkdir(directory);
  const failure = 'External diagnostic literally says Git is unavailable, but the disk is read-only.';
  await installBrandRecovery(desktopApp, directory, { kind: 'external', text: failure });
  await page.reload();
  await page.getByRole('button', { name: 'Create a brand', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a brand', exact: true });
  await dialog.getByRole('textbox', { name: 'Brand name', exact: true }).fill('Preserved draft');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(failure);
  await expect(dialog.getByRole('button', { name: 'Installation guide', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Check again', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('textbox', { name: 'Brand name', exact: true })).toHaveValue(
    'Preserved draft',
  );
  expect(await readdir(directory)).toEqual([]);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
});

test('reopens a saved brand after workspace loading fails without creating it twice', async ({
  desktopApp,
  page,
  userData,
}) => {
  const directory = join(userData, 'Saved parent');
  await mkdir(directory);
  await installBrandRecovery(
    desktopApp,
    directory,
    { kind: 'external', text: 'Workspace loading is temporarily unavailable.' },
    true,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Create a brand', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a brand', exact: true });
  await dialog.getByRole('textbox', { name: 'Brand name', exact: true }).fill('Already saved');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Workspace loading is temporarily unavailable.');
  expect(await readdir(directory)).toEqual(['Already saved']);
  await dialog.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await brandRecoveryStatus(desktopApp)).creates).toHaveLength(1);
  expect((await brandRecoveryStatus(desktopApp)).opens).toBe(2);
});
