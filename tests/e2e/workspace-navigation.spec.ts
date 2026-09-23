import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from './development-fixtures';
import { proveDevelopment } from './startup-development-fixture';
import {
  installNavigationFixture,
  navigationControl,
  navigationObservation,
} from './workspace-navigation-fixture';

async function openClip(
  application: ElectronApplication,
  page: Page,
  parentImported = false,
  clipImported = false,
) {
  await installNavigationFixture(application, parentImported, clipImported);
  await page.reload();
  await proveDevelopment(page);
  await page.getByRole('navigation').getByRole('button', { name: 'Clips', exact: true }).click();
  await page
    .locator('.clips-preview-heading')
    .getByRole('button', { name: clipImported ? 'Edit packaging' : 'Edit clip', exact: true })
    .click();
  await expect(
    page.locator('.clip-packaging').getByRole('textbox', { name: 'Titles', exact: true }),
  ).toHaveValue('Clip short title');
}

for (const outcome of ['success', 'failure'] as const) {
  test(`parent navigation locks the clip before a silent read and recovers after ${outcome}`, async ({
    desktopApp,
    page,
  }) => {
    await openClip(desktopApp, page);
    await navigationControl(desktopApp, { hold: true });
    const titles = page.locator('.clip-packaging').getByRole('textbox', { name: 'Titles', exact: true });
    await page.getByRole('navigation').getByRole('button', { name: 'Packaging', exact: true }).click();
    await expect.poll(async () => (await navigationObservation(desktopApp)).pending).toBe(1);
    await expect(titles).toBeDisabled();
    await expect(page.getByRole('button', { name: 'All clips', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Vandashi', exact: true })).toBeDisabled();
    await expect(
      page.getByRole('navigation').getByRole('button', { name: 'Assets', exact: true }),
    ).toBeDisabled();
    await titles.evaluate((element) => {
      (element as HTMLTextAreaElement).focus();
    });
    await page.keyboard.type('must not enter the locked draft');
    await expect(titles).toHaveValue('Clip short title');
    await navigationControl(desktopApp, { release: outcome });
    if (outcome === 'failure') {
      await expect(page.getByRole('status')).toContainText('Parent workspace could not be opened.');
      await expect(titles).toBeEnabled();
      await titles.fill('Draft after failed navigation');
      await expect(
        page.getByRole('navigation').getByRole('button', { name: 'Assets', exact: true }),
      ).toBeDisabled();
      await expect(titles).toHaveValue('Draft after failed navigation');
    } else {
      await expect(page.locator('.clip-workspace')).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveValue('Test title');
      await expect(
        page.getByRole('navigation').getByRole('button', { name: 'Packaging', exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    }
  });
}

test('a same-tick competing navigation cannot launch a second parent read', async ({ desktopApp, page }) => {
  await openClip(desktopApp, page);
  const initialReads = (await navigationObservation(desktopApp)).calls.filter(
    (call) => call.method === 'openWorkspace' && (call.input as { clipId: string | null }).clipId === null,
  ).length;
  await navigationControl(desktopApp, { hold: true });
  await page.getByRole('navigation').evaluate((element) => {
    const buttons = [...element.querySelectorAll('button')];
    buttons.find((button) => button.textContent === 'Packaging')?.click();
    buttons.find((button) => button.textContent === 'Assets')?.click();
  });
  await expect.poll(async () => (await navigationObservation(desktopApp)).pending).toBeGreaterThan(0);
  expect((await navigationObservation(desktopApp)).pending).toBe(1);
  await navigationControl(desktopApp, { release: 'success' });
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Packaging', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  expect(
    (await navigationObservation(desktopApp)).calls.filter(
      (call) => call.method === 'openWorkspace' && (call.input as { clipId: string | null }).clipId === null,
    ),
  ).toHaveLength(initialReads + 1);
});

for (const outcome of ['success', 'failure'] as const) {
  test(`inner All clips navigation protects the draft through ${outcome}`, async ({ desktopApp, page }) => {
    await openClip(desktopApp, page);
    await navigationControl(desktopApp, { hold: true });
    await page.getByRole('button', { name: 'All clips', exact: true }).click();
    await expect.poll(async () => (await navigationObservation(desktopApp)).pending).toBe(1);
    const titles = page.locator('.clip-packaging').getByRole('textbox', { name: 'Titles', exact: true });
    await expect(titles).toBeDisabled();
    await expect(
      page.getByRole('navigation').getByRole('button', { name: 'Assets', exact: true }),
    ).toBeDisabled();
    await navigationControl(desktopApp, { release: outcome });
    if (outcome === 'success') {
      await expect(page.locator('.clips-list')).toBeVisible();
      await expect(page.locator('.clip-packaging')).toHaveCount(0);
    } else {
      await expect(titles).toBeEnabled();
      await titles.fill('Preserved after failed return');
      await expect(page.getByRole('button', { name: 'All clips', exact: true })).toBeDisabled();
    }
  });
}

test('opening a clip owns navigation until its held workspace response is adopted', async ({
  desktopApp,
  page,
}) => {
  await installNavigationFixture(desktopApp);
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Clips', exact: true }).click();
  await navigationControl(desktopApp, { holdClip: true });
  await page
    .locator('.clips-preview-heading')
    .getByRole('button', { name: 'Edit clip', exact: true })
    .click();
  await expect.poll(async () => (await navigationObservation(desktopApp)).pending).toBe(1);
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Assets', exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator('.clips-preview-heading').getByRole('button', { name: 'Edit clip', exact: true }),
  ).toBeDisabled();
  await navigationControl(desktopApp, { release: 'success' });
  await expect(
    page.locator('.clip-packaging').getByRole('textbox', { name: 'Titles', exact: true }),
  ).toBeEnabled();
});

for (const outcome of ['success', 'failure'] as const) {
  test(`a late parent ${outcome} cannot replace a newer adopted clip snapshot`, async ({
    desktopApp,
    page,
  }) => {
    await openClip(desktopApp, page);
    await navigationControl(desktopApp, { hold: true });
    await page.getByRole('navigation').getByRole('button', { name: 'Packaging', exact: true }).click();
    await expect.poll(async () => (await navigationObservation(desktopApp)).pending).toBe(1);
    await navigationControl(desktopApp, { refresh: true });
    await expect
      .poll(
        async () =>
          (await navigationObservation(desktopApp)).calls.filter(
            (call) =>
              call.method === 'openWorkspace' && (call.input as { clipId: string | null }).clipId !== null,
          ).length,
      )
      .toBe(2);
    await navigationControl(desktopApp, { release: outcome });
    const titles = page.locator('.clip-packaging').getByRole('textbox', { name: 'Titles', exact: true });
    await expect(titles).toBeEnabled();
    await expect(page.getByRole('status')).not.toContainText('Parent workspace could not be opened.');
    await titles.fill('Fresh snapshot draft');
    await expect(titles).toHaveValue('Fresh snapshot draft');
    await expect(
      page.getByRole('navigation').getByRole('button', { name: 'Clips', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  });
}

for (const destination of ['Creation workspace', 'Manual editing']) {
  test(`${destination} targets the composition parent of an imported clip`, async ({ desktopApp, page }) => {
    await openClip(desktopApp, page, false, true);
    const button = page.getByRole('navigation').getByRole('button', { name: destination, exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(button).toHaveAttribute('aria-current', 'page');
    await expect
      .poll(
        async () =>
          (await navigationObservation(desktopApp)).calls.filter(
            (call) =>
              call.method === 'startStudio' && (call.input as { clipId: string | null }).clipId === null,
          ).length,
      )
      .toBeGreaterThan(0);
    await expect(page.locator('.clip-workspace')).toHaveCount(0);
  });
}

test('top-level composition controls remain unavailable for the imported parent of a composition clip', async ({
  desktopApp,
  page,
}) => {
  await openClip(desktopApp, page, true);
  for (const name of ['Creation workspace', 'Manual editing']) {
    const button = page.getByRole('navigation').getByRole('button', { name, exact: true });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('title', /imported/i);
  }
  expect(
    (await navigationObservation(desktopApp)).calls.filter(
      (call) => call.method === 'startStudio' && (call.input as { clipId: string | null }).clipId === null,
    ),
  ).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Return to editing', exact: true })).toBeEnabled();
});
