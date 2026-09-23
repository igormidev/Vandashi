import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from './development-fixtures';
import { proveDevelopment } from './startup-development-fixture';
import {
  creationControl,
  creationObservation,
  installCreationRefreshFixture,
} from './creation-refresh-fixture';

async function openPreview(desktop: ElectronApplication, page: Page, url: string, clip = false) {
  await installCreationRefreshFixture(desktop, url);
  await page.route('**/studio-test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Preview fixture</title>' }),
  );
  await page.reload();
  await proveDevelopment(page);
  if (clip) {
    await page.getByRole('button', { name: 'Clips', exact: true }).click();
    await page.getByRole('button', { name: 'Edit clip', exact: true }).last().click();
  } else
    await page
      .getByRole('navigation', { name: 'Video studio', exact: true })
      .getByRole('button', { name: 'Creation workspace', exact: true })
      .click();
  await expect.poll(async () => (await creationObservation(desktop)).starts.length).toBe(1);
  await creationControl(desktop, { studio: true });
  await expect(page.locator('hyperframes-player')).toHaveAttribute('src', /generation=1&v=one$/);
}

for (const clip of [false, true]) {
  for (const order of ['first', 'last'] as const) {
    test(`development ${clip ? 'clip' : 'main'} preview survives ${order} refresh response while Studio holds its lease`, async ({
      desktopApp,
      page,
      rendererUrl,
    }) => {
      await openPreview(desktopApp, page, rendererUrl, clip);
      const before = (await creationObservation(desktopApp)).reads;
      await creationControl(desktopApp, { refresh: { revision: 'two', clip } });
      await expect.poll(async () => (await creationObservation(desktopApp)).pendingReads).toBeGreaterThan(0);
      await expect(page.getByRole('button', { name: 'Packaging', exact: true })).toBeDisabled();
      await creationControl(desktopApp, { read: order });
      await expect.poll(async () => (await creationObservation(desktopApp)).starts.length).toBe(2);
      // Release any competing reply while startup remains held. It must not replace the owned request.
      await creationControl(desktopApp, { read: 'all' });
      await creationControl(desktopApp, { studio: true });
      await expect(page.locator('hyperframes-player')).toHaveAttribute('src', /generation=2&v=two$/);
      const observed = await creationObservation(desktopApp);
      expect(observed.starts).toHaveLength(2);
      expect(observed.rejectedStarts).toBe(0);
      expect(observed.reads - before).toBe(1);
      expect(observed.starts[1]?.clipId).toBe(clip ? 'clip-one' : null);
    });
  }

  test(`development ${clip ? 'clip' : 'main'} preview restarts after an unchanged-revision completion`, async ({
    desktopApp,
    page,
    rendererUrl,
  }) => {
    await openPreview(desktopApp, page, rendererUrl, clip);
    await creationControl(desktopApp, { refresh: { clip } });
    await expect.poll(async () => (await creationObservation(desktopApp)).pendingReads).toBeGreaterThan(0);
    await creationControl(desktopApp, { read: 'all' });
    await expect.poll(async () => (await creationObservation(desktopApp)).starts.length).toBe(2);
    await creationControl(desktopApp, { studio: true });
    await expect(page.locator('hyperframes-player')).toHaveAttribute('src', /generation=2&v=one$/);
    expect((await creationObservation(desktopApp)).rejectedStarts).toBe(0);
  });
}

for (const refresh of ['unchanged', 'failed'] as const) {
  test(`script edits regain dirty locks after an accepted handoff and ${refresh} workspace refresh`, async ({
    desktopApp,
    page,
    rendererUrl,
  }) => {
    await openPreview(desktopApp, page, rendererUrl);
    const script = page.getByRole('textbox', { name: 'Script', exact: true });
    const submitted = '# Submitted script\n';
    const next = '# A later manual draft\n';
    await script.fill(submitted);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Save & create', exact: true }).click();
    await expect.poll(async () => (await creationObservation(desktopApp)).scripts.length).toBe(1);
    await expect(dialog.getByRole('button', { name: 'Loading…', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await creationControl(desktopApp, { acknowledge: true });
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Script', exact: true })).toBeDisabled();
    await creationControl(desktopApp, { complete: true, refresh: {} });
    await expect.poll(async () => (await creationObservation(desktopApp)).pendingReads).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Script', exact: true })).toBeDisabled();
    await creationControl(desktopApp, { read: refresh === 'failed' ? 'fail' : 'all' });
    if (refresh === 'unchanged') {
      await expect.poll(async () => (await creationObservation(desktopApp)).starts.length).toBe(2);
      await creationControl(desktopApp, { studio: true });
    } else await expect(page.getByRole('status')).toContainText('Refresh failed');
    await page.getByRole('button', { name: 'Script', exact: true }).click();
    await expect(script).toHaveValue(submitted);
    await script.fill(next);
    for (const name of ['Save changes', 'Reset', 'View changes'])
      await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
    for (const name of ['Packaging', 'AI chat', 'Render video'])
      await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'View changes', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('+# A later manual draft');
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(script).toHaveValue(submitted);
    // Revisiting the handoff text through local history must not resurrect its clean exemption.
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Packaging', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(script).toHaveValue(next);
    await expect(page.getByRole('button', { name: 'Packaging', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(script).toHaveValue('# Original script\n');
    await expect(page.getByRole('button', { name: 'Packaging', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(script).toHaveValue(next);
    await expect(page.getByRole('button', { name: 'Packaging', exact: true })).toBeDisabled();
  });
}
