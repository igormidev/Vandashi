import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import type { Asset, Workspace } from '../../src/domain/models';
import { test, expect } from './development-fixtures';
import { installChatFixture } from './chat-fixture';
import { audioFixture } from './audio-fixture';
import {
  installFeedbackHolds,
  feedbackControl,
  feedbackState,
  expectPending,
} from './loading-feedback-fixture';

test('history distinguishes held requests from empty/error states and retries the failed page', async ({
  desktopApp,
  page,
}) => {
  const history = Array.from({ length: 14 }, (_, index) => ({
    sha: String(index).padStart(40, '0'),
    title: `Revision ${String(index)}`,
    body: '',
    files: [],
    date: '2026-09-23T10:00:00Z',
  }));
  await installChatFixture(desktopApp, true, { history });
  await installFeedbackHolds(desktopApp, ['history']);
  await page.reload();
  await page.getByRole('button', { name: 'Creation workspace', exact: true }).click();
  const panel = page.locator('.history');
  await expect(panel.getByRole('status')).toContainText('Loading…');
  await expect(panel.getByRole('status').locator('svg.spin')).toBeVisible();
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  await feedbackControl(desktopApp, { finish: { method: 'history' } });
  await expect(panel.getByText('Revision 0', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  await expect(panel.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect(panel.getByText('Revision 0', { exact: true })).toHaveCount(0);
  await feedbackControl(desktopApp, { finish: { method: 'history', fail: true } });
  await expect(panel.getByRole('status')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  await feedbackControl(desktopApp, { finish: { method: 'history' } });
  await expect(panel.getByText('Revision 12', { exact: true })).toBeVisible();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
});

test('leaving a held history request suppresses its late failure', async ({ desktopApp, page }) => {
  await installChatFixture(desktopApp, true);
  await installFeedbackHolds(desktopApp, ['history']);
  await page.reload();
  await page.getByRole('button', { name: 'Creation workspace', exact: true }).click();
  await expect(page.locator('.history')).toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: 'Packaging', exact: true }).click();
  await expect(page.locator('.history')).toHaveCount(0);
  await feedbackControl(desktopApp, { finish: { method: 'history', fail: true } });
  await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBe(0);
  await expect(page.locator('.toast')).toHaveCount(0);
});

for (const video of [false, true]) {
  test(`${video ? 'video' : 'shared'} assets keep import progress and reviewed metadata through failure/retry`, async ({
    desktopApp,
    page,
  }) => {
    await installChatFixture(desktopApp, video, { assetImportPath: '/tmp/reviewed.png' });
    await installFeedbackHolds(desktopApp, ['importAsset']);
    await page.reload();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: video ? 'Assets' : 'Shared assets', exact: true })
      .click();
    await page.getByRole('button', { name: 'Add assets', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const title = dialog.getByRole('textbox', { name: 'Asset title', exact: true });
    await title.fill('My reviewed artwork');
    await dialog.getByRole('button', { name: 'Add to library', exact: true }).click();
    await expectPending(dialog.getByRole('button', { name: 'Loading…', exact: true }));
    await expect(title).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await feedbackControl(desktopApp, { finish: { method: 'importAsset', fail: true } });
    await expect(title).toBeEnabled();
    await expect(title).toHaveValue('My reviewed artwork');
    await expect(dialog.locator('svg.spin')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Add to library', exact: true }).click();
    await expectPending(dialog.getByRole('button', { name: 'Loading…', exact: true }));
    await feedbackControl(desktopApp, { finish: { method: 'importAsset' } });
    await expect(dialog).toBeHidden();
    await expect(page.locator('.asset-tile')).toContainText('My reviewed artwork');
    await feedbackControl(desktopApp, { hold: ['openWorkspace'] });
    const refresh = page.getByRole('button', { name: 'Refresh assets', exact: true });
    await refresh.click();
    await expectPending(refresh);
    await feedbackControl(desktopApp, { finish: { method: 'openWorkspace' } });
    await expect(refresh).toBeEnabled();
    await expect(refresh.locator('svg.spin')).toHaveCount(0);
  });

  test(`${video ? 'video' : 'shared'} audio waveform marks extraction pending and settles failure/success`, async ({
    desktopApp,
    page,
    userData,
  }) => {
    const path = join(userData, 'recording.wav');
    await writeFile(path, audioFixture());
    const audio: Asset = {
      id: 'recording',
      path,
      relativePath: 'recording.wav',
      title: 'Recording',
      description: 'Audio fixture',
      tags: [],
      kind: 'audio',
      size: 100,
      hash: 'recording',
      revision: 'a'.repeat(64),
      shared: !video,
      mediaUrl: 'vandashi-media://local/recording.wav',
    };
    await installChatFixture(desktopApp, video, { assets: [audio], mediaPath: path });
    await installFeedbackHolds(desktopApp, ['assetWaveform']);
    await page.reload();
    const navigation = page.getByRole('navigation');
    await navigation.getByRole('button', { name: video ? 'Assets' : 'Shared assets', exact: true }).click();
    await page.locator('.asset-tile').click();
    const waveform = page.locator('.asset-waveform');
    await expect(waveform).toHaveAttribute('role', 'status');
    await expect(waveform).toHaveAttribute('aria-busy', 'true');
    await expect(waveform.locator('svg.spin')).toBeVisible();
    await expect(waveform.locator('svg.spin')).toHaveCSS('height', '16px');
    await feedbackControl(desktopApp, { finish: { method: 'assetWaveform', fail: true } });
    await expect(waveform).toHaveAttribute('aria-label', 'Waveform unavailable');
    await expect(waveform.locator('svg.spin')).toHaveCount(0);
    await navigation.getByRole('button', { name: video ? 'Packaging' : 'Brand', exact: true }).click();
    await navigation.getByRole('button', { name: video ? 'Assets' : 'Shared assets', exact: true }).click();
    await page.locator('.asset-tile').click();
    await expect(waveform.locator('svg.spin')).toBeVisible();
    await feedbackControl(desktopApp, { finish: { method: 'assetWaveform' } });
    await expect(waveform).toHaveAttribute('aria-label', 'Audio waveform');
    await expect(waveform).toHaveAttribute('aria-busy', 'false');
    await expect(waveform.locator('rect')).toHaveCount(100);
  });
}

test('a failed clip media grant ends the loading state with a recoverable error view', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, true, { clips: true });
  await installFeedbackHolds(desktopApp, ['mediaUrl']);
  await page.reload();
  await page.getByRole('button', { name: 'Clips', exact: true }).click();
  await expect(page.locator('.clips-preview-panel').getByRole('status').locator('svg.spin')).toBeVisible();
  await feedbackControl(desktopApp, { finish: { method: 'mediaUrl', fail: true } });
  await expect(
    page.getByRole('heading', { name: 'This video could not be opened.', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.clips-preview-panel').getByRole('status')).toHaveCount(0);
});

test('thumbnail import shows its owned wait and protects packaging until failure or adoption', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, true, { assetImportPath: '/tmp/reviewed.png' });
  await desktopApp.evaluate(({ ipcMain }) => {
    type Invoke = (event: IpcMainInvokeEvent, method: string, args: unknown[]) => unknown;
    const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Invoke> })._invokeHandlers.get(
      'vandashi:invoke',
    );
    if (!invoke) throw new Error('Missing fixture handler');
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', async (event, method: string, args: unknown[]) => {
      if (method !== 'importThumbnail') return invoke(event, method, args);
      const workspace = (await invoke(event, 'openWorkspace', [])) as Workspace;
      if (!workspace.video) throw new Error('Missing video');
      return {
        ...workspace,
        revision: 'imported-thumbnail',
        video: {
          ...workspace.video,
          packaging: { ...workspace.video.packaging, thumbnails: ['thumbnails/reviewed.png'] },
        },
      };
    });
  });
  await installFeedbackHolds(desktopApp, ['importThumbnail']);
  await page.reload();
  const title = page.getByRole('textbox', { name: 'Titles', exact: true });
  await expect(title).toHaveValue('Test title');
  await page.getByRole('button', { name: 'Add thumbnail', exact: true }).click();
  const pending = page.locator('.panel-scroll').getByRole('button', { name: 'Loading…', exact: true });
  await expectPending(pending);
  await expect(title).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Creation workspace', exact: true })).toBeDisabled();
  await feedbackControl(desktopApp, { finish: { method: 'importThumbnail', fail: true } });
  await expect(title).toBeEnabled();
  await expect(title).toHaveValue('Test title');
  await expect(pending).toHaveCount(0);
  await page.getByRole('button', { name: 'Add thumbnail', exact: true }).click();
  await expectPending(pending);
  await feedbackControl(desktopApp, { finish: { method: 'importThumbnail' } });
  await expect(title).toBeEnabled();
  await expect(page.locator('.thumbnail')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Creation workspace', exact: true })).toBeEnabled();
});
