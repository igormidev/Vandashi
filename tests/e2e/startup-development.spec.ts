import { test, expect } from './development-fixtures';
import type { Locator } from '@playwright/test';
import {
  installStartupFixture,
  proveDevelopment,
  startupCalls,
  startupControl,
} from './startup-development-fixture';

async function expectCommitLoading(dialog: Locator) {
  const status = dialog.getByRole('status');
  await expect(status).toHaveText('Writing a commit message…');
  await expect(status.locator('.spin')).toBeVisible();
  await expect(status.locator('.indeterminate-track')).toBeVisible();
  await expect(status.locator('.spin')).toHaveCSS('animation-name', 'spin');
  await expect(dialog.getByRole('textbox', { name: 'Commit title', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Loading…', exact: true })).toHaveAttribute(
    'aria-busy',
    'true',
  );
}

test('development checks retain the original gated result and reload exactly once per attempt', async ({
  desktopApp,
  page,
  rendererUrl,
}) => {
  await installStartupFixture(desktopApp, rendererUrl, true);
  await page.reload();
  await proveDevelopment(page);
  await expect(page.getByRole('heading', { name: 'Preparing your workspace', exact: true })).toBeVisible();
  await expect
    .poll(async () => (await startupCalls(desktopApp)).filter(({ method }) => method === 'checks').length)
    .toBe(1);
  const reads = (await startupCalls(desktopApp)).filter(({ method }) => method === 'openWorkspace').length;
  // Ready progress alone must not bypass the final check result.
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveCount(0);
  await startupControl(desktopApp, { release: 'checks', fail: true });
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect
    .poll(async () => (await startupCalls(desktopApp)).filter(({ method }) => method === 'checks').length)
    .toBe(2);
  await startupControl(desktopApp, { release: 'checks' });
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toBeVisible();
  expect((await startupCalls(desktopApp)).filter(({ method }) => method === 'openWorkspace')).toHaveLength(
    reads + 1,
  );
});

test('development main preview, manual Studio, and clip preview each reuse their pending startup', async ({
  desktopApp,
  page,
  rendererUrl,
}) => {
  await installStartupFixture(desktopApp, rendererUrl);
  await page.route('**/studio-test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Studio fixture</title><main>Preview fixture</main>',
    }),
  );
  await page.reload();
  await proveDevelopment(page);
  await page.getByRole('button', { name: 'Creation workspace', exact: true }).click();
  await expect
    .poll(
      async () => (await startupCalls(desktopApp)).filter(({ method }) => method === 'startStudio').length,
    )
    .toBe(1);
  await startupControl(desktopApp, { release: 'startStudio' });
  await expect(page.locator('hyperframes-player')).toHaveAttribute(
    'src',
    /studio-test\/preview.html\?v=one$/,
  );
  await page.getByRole('button', { name: 'Manual editing', exact: true }).click();
  await expect
    .poll(
      async () => (await startupCalls(desktopApp)).filter(({ method }) => method === 'startStudio').length,
    )
    .toBe(2);
  await startupControl(desktopApp, { release: 'startStudio' });
  await expect(page.locator('.studio-frame')).toHaveAttribute('src', /studio-test\/editor.html$/);
  await page.getByRole('button', { name: 'Creation workspace', exact: true }).click();
  await expect
    .poll(
      async () => (await startupCalls(desktopApp)).filter(({ method }) => method === 'startStudio').length,
    )
    .toBe(3);
  await startupControl(desktopApp, { release: 'startStudio', fail: true });
  await expect(page.locator('.preview-stage')).toContainText('Fixture startup failed');
  await page.locator('.preview-stage').getByRole('button', { name: 'Check again', exact: true }).click();
  await expect
    .poll(
      async () => (await startupCalls(desktopApp)).filter(({ method }) => method === 'startStudio').length,
    )
    .toBe(4);
  await startupControl(desktopApp, { release: 'startStudio' });
  await expect(page.locator('hyperframes-player')).toHaveAttribute('src', /studio-test\/preview.html/);
  await page.getByRole('button', { name: 'Clips', exact: true }).click();
  await page.getByRole('button', { name: 'Edit clip', exact: true }).last().click();
  await expect
    .poll(
      async () => (await startupCalls(desktopApp)).filter(({ method }) => method === 'startStudio').length,
    )
    .toBe(5);
  await startupControl(desktopApp, { release: 'startStudio' });
  await expect(page.locator('.clip-editor-preview hyperframes-player')).toHaveAttribute(
    'src',
    /studio-test\/preview.html/,
  );
  const starts = (await startupCalls(desktopApp)).filter(({ method }) => method === 'startStudio');
  expect(starts.at(-1)?.input).toMatchObject({ clipId: 'clip-one' });
});

test('development commit confirmation retains one generated result and preserves typed text through workspace refresh', async ({
  desktopApp,
  page,
  rendererUrl,
}) => {
  await installStartupFixture(desktopApp, rendererUrl);
  await page.route('**/studio-test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Studio fixture</title>' }),
  );
  await page.reload();
  await proveDevelopment(page);
  await page.getByRole('button', { name: 'Manual editing', exact: true }).click();
  await expect
    .poll(
      async () => (await startupCalls(desktopApp)).filter(({ method }) => method === 'startStudio').length,
    )
    .toBe(1);
  await startupControl(desktopApp, { release: 'startStudio', studioDirty: true });
  await expect(page.locator('.studio-frame')).toBeVisible();
  await page.getByRole('button', { name: 'Packaging', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a version', exact: true });
  await expect
    .poll(
      async () => (await startupCalls(desktopApp)).filter(({ method }) => method === 'suggestCommit').length,
    )
    .toBe(1);
  await expectCommitLoading(dialog);
  await startupControl(desktopApp, { release: 'suggestCommit' });
  const title = dialog.getByRole('textbox', { name: 'Commit title', exact: true });
  const body = dialog.getByRole('textbox', { name: 'What changed', exact: true });
  await expect(title).toHaveValue('Generated review title');
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await title.fill('My reviewed title');
  await body.fill('My independent explanation.');
  const before = (await startupCalls(desktopApp)).filter(({ method }) => method === 'openWorkspace').length;
  await startupControl(desktopApp, { refresh: true });
  await expect
    .poll(
      async () => (await startupCalls(desktopApp)).filter(({ method }) => method === 'openWorkspace').length,
    )
    .toBeGreaterThan(before);
  await expect(title).toHaveValue('My reviewed title');
  await expect(body).toHaveValue('My independent explanation.');
  expect((await startupCalls(desktopApp)).filter(({ method }) => method === 'suggestCommit')).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await startupCalls(desktopApp)).find(({ method }) => method === 'saveStudio')?.input).toMatchObject(
    { title: 'My reviewed title', body: 'My independent explanation.' },
  );
});

for (const consumer of ['brand', 'packaging', 'shared-asset', 'video-asset'] as const) {
  test(`development ${consumer} commit confirmation reattaches the original generation`, async ({
    desktopApp,
    page,
    rendererUrl,
  }) => {
    const video = consumer === 'packaging' || consumer === 'video-asset';
    await installStartupFixture(desktopApp, rendererUrl, false, video);
    await page.reload();
    await proveDevelopment(page);
    if (consumer === 'brand') {
      await page
        .getByRole('textbox', { name: 'What is it about?', exact: true })
        .fill('Reviewed brand direction.');
    } else if (consumer === 'packaging') {
      await page.getByRole('textbox', { name: 'Titles', exact: true }).fill('Reviewed video title');
    } else {
      await page
        .getByRole('navigation')
        .getByRole('button', { name: video ? 'Assets' : 'Shared assets', exact: true })
        .click();
      await page.locator('.asset-tile').click();
      await page.getByRole('textbox', { name: 'Asset title', exact: true }).fill('Reviewed artwork');
    }
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Save a version', exact: true });
    await expect
      .poll(
        async () =>
          (await startupCalls(desktopApp)).filter(({ method }) => method === 'suggestCommit').length,
      )
      .toBe(1);
    await expectCommitLoading(dialog);
    if (consumer === 'brand') {
      await expect(dialog).toHaveCSS('opacity', '1');
      await page.screenshot({ path: '/tmp/vandashi-commit-loading-brand.png' });
    }
    await startupControl(desktopApp, { release: 'suggestCommit' });
    await expect(dialog.getByRole('textbox', { name: 'Commit title', exact: true })).toHaveValue(
      'Generated review title',
    );
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await dialog.getByRole('textbox', { name: 'Commit title', exact: true }).fill('My reviewed version');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).toBeHidden();
    const save = (await startupCalls(desktopApp)).find(({ method }) =>
      ['saveWorkspace', 'updateAsset'].includes(method),
    );
    expect(save?.input).toMatchObject({ commit: { title: 'My reviewed version' } });
    expect((await startupCalls(desktopApp)).filter(({ method }) => method === 'suggestCommit')).toHaveLength(
      1,
    );
  });
}

test('commit generation retains visible feedback with reduced motion and permits manual recovery after failure', async ({
  desktopApp,
  page,
  rendererUrl,
}) => {
  await installStartupFixture(desktopApp, rendererUrl, false, false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Updated brand');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a version', exact: true });
  const status = dialog.getByRole('status');
  await expect(status).toHaveText('Writing a commit message…');
  await expect(status.locator('.spin')).toBeVisible();
  await expect(status.locator('.spin')).toHaveCSS('animation-name', 'none');
  await expect(status.locator('.indeterminate-track > span')).toHaveCSS('animation-name', 'none');
  await startupControl(desktopApp, {
    release: 'suggestCommit',
    diagnostic: { kind: 'app', message: { id: 'appCommitGenerationFailed' } },
  });
  await expect(status).toHaveCount(0);
  await expect(dialog.getByRole('alert')).toContainText('Could not generate a commit message.');
  await dialog.getByRole('textbox', { name: 'Commit title', exact: true }).fill('Manual title');
  await dialog
    .getByRole('textbox', { name: 'What changed', exact: true })
    .fill('Preserve the reviewed brand edit.');
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
});

test('cancelled commit generation cannot resurrect its dialog or discard the manual draft', async ({
  desktopApp,
  page,
  rendererUrl,
}) => {
  await installStartupFixture(desktopApp, rendererUrl, false, false);
  await page.reload();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Keep this draft');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a version', exact: true });
  await expectCommitLoading(dialog);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await startupControl(desktopApp, { release: 'suggestCommit' });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Keep this draft');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
});
