import { test, expect } from './fixtures';
import { chatRequests, installChatFixture } from './chat-fixture';

// Deterministic helper failures cross the actual main/preload bridge and bundled renderer.
// Provider inference is covered separately by the live Codex adapter tests.
test('shows commit-generation diagnostics and still saves a manually reviewed commit', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, {
    references: true,
    commitFailure: {
      kind: 'app',
      message: { id: 'appCommitGenerationFailed' },
      externalDetail: 'Provider quota is temporarily exhausted.',
    },
  });
  await page.reload();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Manual fallback brand');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a version', exact: true });
  await expect(dialog.getByRole('alert')).toContainText('Could not generate a commit message.');
  await expect(dialog.getByRole('alert')).toContainText('Provider quota is temporarily exhausted.');
  await expect(dialog).not.toContainText('VANDASHI_DIAGNOSTIC');
  await expect(dialog.getByRole('textbox', { name: 'Commit title', exact: true })).toBeEnabled();
  await dialog.getByRole('textbox', { name: 'Commit title', exact: true }).fill('Update brand name');
  await dialog
    .getByRole('textbox', { name: 'What changed', exact: true })
    .fill('Keep the manually reviewed brand name.');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await chatRequests(desktopApp)).toContainEqual(
    expect.objectContaining({
      method: 'saveWorkspace',
      input: expect.objectContaining({
        commit: { title: 'Update brand name', body: 'Keep the manually reviewed brand name.' },
      }),
    }),
  );
});

test('shows asset-inspection diagnostics and keeps manual metadata import available', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, {
    assets: [],
    assetImportPath: '/tmp/reviewed-recording.wav',
    describeFailure: {
      kind: 'app',
      message: { id: 'mediaModelDownloadFailed', params: { status: 503 } },
      externalDetail: 'The model host is temporarily unavailable.',
    },
  });
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Shared assets', exact: true }).click();
  await page.getByRole('button', { name: 'Add assets', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to library', exact: true });
  await expect(dialog.getByRole('alert')).toContainText('Speech model download failed (503).');
  await expect(dialog.getByRole('alert')).toContainText('The model host is temporarily unavailable.');
  await expect(dialog).not.toContainText('VANDASHI_DIAGNOSTIC');
  await expect(dialog.getByRole('textbox', { name: 'Asset title', exact: true })).toBeEnabled();
  await dialog.getByRole('textbox', { name: 'Asset title', exact: true }).fill('Reviewed narration');
  await dialog
    .getByRole('textbox', { name: 'What is in this asset?', exact: true })
    .fill('An approved narration recording.');
  await dialog.getByRole('button', { name: 'Add to library', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.asset-tile')).toContainText('Reviewed narration');
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Brand', exact: true }),
  ).toBeEnabled();
});
