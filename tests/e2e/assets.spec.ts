import type { Asset } from '../../src/domain/models';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { audioFixture } from './audio-fixture';
import { test, expect } from './fixtures';
import { chatCalls, installChatFixture } from './chat-fixture';

const assets: Asset[] = [
  {
    id: 'logo',
    path: '/tmp/logo.png',
    relativePath: 'logos/logo.png',
    title: 'Orbit logo',
    description: 'Cobalt identity mark',
    tags: ['brand'],
    kind: 'image',
    size: 100,
    hash: 'logo',
    revision: 'a'.repeat(64),
    shared: true,
    mediaUrl: '',
  },
  {
    id: 'footage',
    path: '/tmp/footage.mp4',
    relativePath: 'footage.mp4',
    title: 'City footage',
    description: 'Aerial city view',
    tags: ['city'],
    kind: 'video',
    size: 100,
    hash: 'footage',
    revision: 'a'.repeat(64),
    shared: true,
    mediaUrl: '',
  },
];

test('keeps the asset library and inspector usable at minimum window size and maximum chat width', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, { assets });
  await desktopApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1200, 720);
  });
  await page.evaluate(async () => {
    if (!window.vandashi) throw new Error('Missing preload');
    const state = await window.vandashi.getState();
    await window.vandashi.settings({ ...state.settings, splits: { ...state.settings.splits, assets: 75 } });
  });
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Shared assets', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Resize panels' })).toHaveAttribute('aria-valuenow', '75');
  await page.getByRole('textbox', { name: 'Search names, descriptions, and tags' }).fill('cobalt');
  await page.locator('.asset-tile').click();
  const geometry = await page.evaluate(() => {
    const library = document.querySelector('.asset-library');
    const inspector = document.querySelector('.asset-inspector');
    if (!(library instanceof HTMLElement) || !(inspector instanceof HTMLElement))
      throw new Error('Missing asset panels');
    const first = library.getBoundingClientRect();
    const second = inspector.getBoundingClientRect();
    return {
      width: first.width,
      stacked: second.top >= first.bottom - 1,
      aligned: Math.abs(first.left - second.left) < 1,
      withinWindow: second.right <= window.innerWidth,
      libraryOverflow: library.scrollWidth > library.clientWidth,
      inspectorOverflow: inspector.scrollWidth > inspector.clientWidth,
    };
  });
  expect(geometry.width).toBeGreaterThan(250);
  expect(geometry).toMatchObject({
    stacked: true,
    aligned: true,
    withinWindow: true,
    libraryOverflow: false,
    inspectorOverflow: false,
  });
  await expect(page.getByRole('textbox', { name: 'Asset title', exact: true })).toHaveValue('Orbit logo');
});

test('shows a host-generated waveform and playable audio for a large asset', async ({
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
    title: 'Long recording',
    description: 'Audio fixture',
    tags: [],
    kind: 'audio',
    size: 120_000_000,
    hash: 'recording',
    revision: 'a'.repeat(64),
    shared: true,
    mediaUrl: 'vandashi-media://local/recording.wav',
  };
  await installChatFixture(desktopApp, false, { assets: [audio], mediaPath: path });
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Shared assets', exact: true }).click();
  await page.locator('.asset-tile').click();
  await expect(page.getByRole('img', { name: 'Audio waveform', exact: true })).toBeVisible();
  await expect(page.locator('.asset-waveform rect')).toHaveCount(100);
  await expect
    .poll(() => page.locator('audio').evaluate((element: HTMLAudioElement) => element.readyState))
    .toBeGreaterThanOrEqual(1);
  await expect(page.locator('audio')).toHaveAttribute('controls', '');
});

test('searches nested assets and saves metadata through editable commit confirmation', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, { assets });
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Shared assets', exact: true }).click();
  const library = page.getByRole('region', { name: 'Library', exact: true });
  for (const label of ['Images', 'Videos', 'Audio'])
    await expect(library.getByRole('checkbox', { name: label })).toBeChecked();
  await expect(library.getByRole('button', { name: 'logos', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search names, descriptions, and tags' }).fill('cobalt identity');
  await expect(page.locator('.asset-tile')).toHaveCount(1);
  await page.locator('.asset-tile').click();
  const details = page.locator('.asset-inspector');
  await expect(details.getByRole('textbox', { name: 'Asset title', exact: true })).toHaveValue('Orbit logo');
  await details.getByRole('textbox', { name: 'Asset title', exact: true }).fill('Orbit identity');
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Brand', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refresh assets', exact: true })).toBeDisabled();
  await details.getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a version' });
  await expect(dialog.getByRole('textbox', { name: 'Commit title' })).toHaveValue('Clarify asset metadata');
  await dialog.getByRole('textbox', { name: 'Commit title' }).fill('Refine logo identity');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(details.getByRole('textbox', { name: 'Asset title', exact: true })).toHaveValue(
    'Orbit identity',
  );
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toBeEnabled();
  const reads = (await chatCalls(desktopApp)).filter((method) => method === 'openWorkspace').length;
  await page.getByRole('button', { name: 'Refresh assets', exact: true }).click();
  await expect
    .poll(async () => (await chatCalls(desktopApp)).filter((method) => method === 'openWorkspace').length)
    .toBeGreaterThan(reads);
});

test('lets an import proceed with reviewed manual metadata when automatic description fails', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, {
    assets: [],
    assetImportPath: '/tmp/picked.png',
    describeFails: true,
  });
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Shared assets', exact: true }).click();
  await page.getByRole('button', { name: 'Add assets', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to library', exact: true });
  await expect(dialog.getByRole('alert')).toContainText('AI temporarily unavailable');
  await dialog.getByRole('textbox', { name: 'Asset title', exact: true }).fill('Reviewed artwork');
  await dialog
    .getByRole('textbox', { name: 'What is in this asset?', exact: true })
    .fill('A simple circular brand mark');
  await dialog.getByRole('textbox', { name: 'Tags', exact: true }).fill('brand, #identity, brand');
  await dialog.getByRole('button', { name: 'Add to library', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.asset-tile')).toContainText('Reviewed artwork');
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Brand', exact: true }),
  ).toBeEnabled();
});
