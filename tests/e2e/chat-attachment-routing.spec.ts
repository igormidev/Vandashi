import type { Page } from '@playwright/test';
import type { Asset } from '../../src/domain/models';
import { test, expect } from './development-fixtures';
import { installChatFixture } from './chat-fixture';
import { installPicker } from './chat-attachments-fixture';
import {
  feedbackControl,
  feedbackState,
  installFeedbackHolds,
  expectPending,
} from './loading-feedback-fixture';
import { installClipsFixture } from './clips-fixture';

const ask = (page: Page) => page.getByRole('button', { name: 'Work on this with AI', exact: true });
const asset: Asset = {
  id: 'attachment-logo',
  path: '/tmp/logo.svg',
  relativePath: 'logo.svg',
  title: 'Mint logo',
  description: 'A mint triangle',
  tags: ['logo'],
  kind: 'image',
  size: 195,
  hash: 'logo',
  revision: 'a'.repeat(64),
  shared: false,
  mediaUrl: '',
};
const topics = [
  { topic: 'packaging:title:long', title: 'Titles · long form' },
  { topic: 'thumbnails', title: 'Thumbnails' },
  { topic: 'creation', title: 'Creation workspace' },
  { topic: 'assets', title: 'Assets' },
  { topic: 'asset:attachment-logo', title: 'Mint logo' },
];
const cases: { name: string; video: boolean; sessionId: string; open: (page: Page) => Promise<void> }[] = [
  {
    name: 'brand attributes',
    video: false,
    sessionId: 'chat-one',
    open: async (page) => {
      await ask(page).first().click();
    },
  },
  {
    name: 'brand taste',
    video: false,
    sessionId: 'chat-two',
    open: async (page) => {
      await page
        .locator('.chat-tabs')
        .getByRole('button', { name: 'Titles · long form', exact: true })
        .click();
    },
  },
  {
    name: 'video packaging',
    video: true,
    sessionId: 'attachment:packaging:title:long',
    open: async (page) => {
      await page
        .locator('label.field')
        .filter({ has: page.getByRole('textbox', { name: 'Titles', exact: true }) })
        .getByRole('button', { name: 'Work on this with AI', exact: true })
        .click();
    },
  },
  {
    name: 'thumbnails',
    video: true,
    sessionId: 'attachment:thumbnails',
    open: async (page) => {
      await page
        .locator('.field')
        .filter({ has: page.locator('.thumbnail-grid') })
        .getByRole('button', { name: 'Work on this with AI', exact: true })
        .click();
    },
  },
  {
    name: 'creation',
    video: true,
    sessionId: 'attachment:creation',
    open: async (page) => {
      await page.getByRole('button', { name: 'Creation workspace', exact: true }).click();
      await page.getByRole('button', { name: 'AI chat', exact: true }).click();
    },
  },
  ...[false, true].flatMap((video) =>
    [false, true].map((selected) => ({
      name: `${video ? 'video' : 'shared'} ${selected ? 'selected asset' : 'asset folder'}`,
      video,
      sessionId: `attachment:${selected ? 'asset:attachment-logo' : 'assets'}`,
      open: async (page: Page) => {
        await page
          .getByRole('navigation')
          .getByRole('button', { name: video ? 'Assets' : 'Shared assets', exact: true })
          .click();
        if (selected) await page.locator('.asset-tile').click();
        await page
          .locator(
            selected ? '.asset-inspector .asset-panel-heading' : '.asset-library > .asset-panel-heading',
          )
          .getByRole('button', { name: 'Work on this with AI', exact: true })
          .click();
      },
    })),
  ),
  {
    name: 'prepared publishing',
    video: true,
    sessionId: 'chat-publish',
    open: async (page) => {
      await page.getByRole('button', { name: 'Launch suite', exact: true }).click();
      await page
        .locator('.launch-row')
        .filter({ has: page.getByRole('heading', { name: 'YouTube', exact: true }) })
        .getByRole('button', { name: 'Prepare upload', exact: true })
        .click();
      await page.getByRole('button', { name: 'Open upload chat', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveText(
        'Prepared upload request 1',
      );
    },
  },
];

for (const consumer of cases)
  test(`attachment send is locked and routed in ${consumer.name}`, async ({ desktopApp, page }) => {
    await installChatFixture(desktopApp, consumer.video, {
      references: true,
      extraTopics: topics,
      assets: [{ ...asset, shared: !consumer.video }],
    });
    await installPicker(desktopApp, [['/tmp/selected.svg']]);
    await installFeedbackHolds(desktopApp, ['sendChat']);
    await page.reload();
    await consumer.open(page);
    await page.getByRole('button', { name: 'Attach files', exact: true }).click();
    await expect(page.locator('.attachments .badge')).toHaveText(['selected.svg']);
    await page.getByRole('textbox', { name: 'AI chat', exact: true }).fill('Review this reference');
    const send = page.getByRole('button', { name: 'Send message', exact: true });
    await send.click();
    await expectPending(send);
    await expect(
      page.locator('.attachments').getByRole('button', { name: 'Remove', exact: true }),
    ).toBeDisabled();
    expect((await feedbackState(desktopApp)).pending[0]?.args[0]).toMatchObject({
      sessionId: consumer.sessionId,
      attachments: ['/tmp/selected.svg'],
    });
    await feedbackControl(desktopApp, { finish: { method: 'sendChat' } });
    await expect(page.locator('.attachments .badge')).toHaveCount(0);
  });

test('clip packaging attachments reach the clip conversation and retain their selection on failure', async ({
  desktopApp,
  page,
}) => {
  await installClipsFixture(desktopApp, 'none', true);
  await installPicker(desktopApp, [['/tmp/clip-reference.svg']]);
  await installFeedbackHolds(desktopApp, ['sendChat']);
  await page.reload();
  await page.getByRole('button', { name: 'Clips', exact: true }).click();
  await page
    .locator('.clips-preview-heading')
    .getByRole('button', { name: 'Edit packaging', exact: true })
    .click();
  await page
    .locator('label.field')
    .filter({ has: page.getByRole('textbox', { name: 'Titles', exact: true }) })
    .getByRole('button', { name: 'Work on this with AI', exact: true })
    .click();
  await page.getByRole('button', { name: 'Attach files', exact: true }).click();
  await page.getByRole('textbox', { name: 'AI chat', exact: true }).fill('Use this clip reference');
  const send = page.getByRole('button', { name: 'Send message', exact: true });
  await send.click();
  await expectPending(send);
  await expect(
    page.locator('.attachments').getByRole('button', { name: 'Remove', exact: true }),
  ).toBeDisabled();
  expect((await feedbackState(desktopApp)).pending[0]?.args[0]).toMatchObject({
    sessionId: 'created-clip:packaging:title:short',
    attachments: ['/tmp/clip-reference.svg'],
  });
  await feedbackControl(desktopApp, { finish: { method: 'sendChat', fail: true } });
  await expect(page.locator('.attachments .badge')).toHaveText(['clip-reference.svg']);
  await expect(send).toBeEnabled();
});
