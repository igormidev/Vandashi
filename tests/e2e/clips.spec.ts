import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { clipRequests, finishClip, installClipsFixture } from './clips-fixture';

async function openForm(page: Page) {
  await page.reload();
  await page.getByRole('button', { name: 'Clips', exact: true }).click();
  await page.getByRole('button', { name: 'New clip', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'End (seconds)', exact: true })).toHaveValue('30');
  await expect.poll(() => page.locator('video').evaluate((node: HTMLVideoElement) => node.duration)).toBe(60);
}

async function ratio(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('The framing guide is not visible');
  return box.width / box.height;
}

test('edits clip seconds with ordinary keyboard input and plays only the committed selection', async ({
  desktopApp,
  page,
}) => {
  await installClipsFixture(desktopApp);
  await openForm(page);
  const start = page.getByRole('spinbutton', { name: 'Start (seconds)', exact: true });
  const end = page.getByRole('spinbutton', { name: 'End (seconds)', exact: true });
  const startHandle = page.getByRole('slider', { name: 'Selection start', exact: true });
  const endHandle = page.getByRole('slider', { name: 'Selection end', exact: true });
  await start.click();
  await start.press('ControlOrMeta+A');
  await start.press('Backspace');
  await expect(start).toHaveValue('');
  await start.pressSequentially('2');
  await expect(startHandle).toHaveValue('0');
  await start.press('Tab');
  await expect(startHandle).toHaveValue('2');
  await end.press('ControlOrMeta+A');
  await end.press('Backspace');
  await expect(end).toHaveValue('');
  await end.pressSequentially('6');
  await end.press('Enter');
  await expect(start).toHaveValue('2');
  await expect(endHandle).toHaveValue('6');
  await start.fill('');
  await start.press('Tab');
  await expect(start).toHaveValue('2');
  await end.fill('-100');
  await end.press('Enter');
  await expect(end).toHaveValue('2.1');
  await end.fill('1000');
  await end.press('Tab');
  await expect(end).toHaveValue('60');
  await endHandle.fill('6');
  await expect(end).toHaveValue('6');
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluate((node: HTMLVideoElement) => !node.paused && node.currentTime >= 2 && node.currentTime < 6),
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        page
          .locator('video')
          .evaluate((node: HTMLVideoElement) => node.paused && Math.abs(node.currentTime - 2) < 0.1),
      { timeout: 6000 },
    )
    .toBe(true);
  await page.getByRole('textbox', { name: 'Clip name', exact: true }).fill('Numeric excerpt');
  await page.getByRole('button', { name: 'Create clip', exact: true }).click();
  await expect
    .poll(async () => (await clipRequests(desktopApp)).some((entry) => entry.method === 'createClip'))
    .toBe(true);
  expect(
    (await clipRequests(desktopApp)).find((entry) => entry.method === 'createClip')?.input,
  ).toMatchObject({
    start: 2,
    end: 6,
  });
});

test('trims real media, keeps the initial conversation through packaging edits, and returns to its parent', async ({
  desktopApp,
  page,
}) => {
  await installClipsFixture(desktopApp);
  await openForm(page);
  const start = page.getByRole('slider', { name: 'Selection start', exact: true });
  const end = page.getByRole('slider', { name: 'Selection end', exact: true });
  await start.fill('5');
  await end.fill('6');
  await expect(page.getByRole('spinbutton', { name: 'Start (seconds)', exact: true })).toHaveValue('5');
  await expect(page.getByRole('spinbutton', { name: 'End (seconds)', exact: true })).toHaveValue('6');
  await expect
    .poll(() => page.locator('video').evaluate((node: HTMLVideoElement) => node.currentTime))
    .toBeCloseTo(6, 1);
  expect(await ratio(page.locator('.clip-crop-guide'))).toBeCloseTo(9 / 16, 2);
  await page.getByRole('button', { name: 'Square 1:1', exact: true }).click();
  expect(await ratio(page.locator('.clip-crop-guide'))).toBeCloseTo(1, 2);
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  await expect
    .poll(() =>
      page.locator('video').evaluate((node: HTMLVideoElement) => !node.paused && node.currentTime >= 5),
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        page
          .locator('video')
          .evaluate((node: HTMLVideoElement) => node.paused && Math.abs(node.currentTime - 5) < 0.1),
      { timeout: 4000 },
    )
    .toBe(true);
  await expect(start).toHaveValue('5');
  await expect(end).toHaveValue('6');
  await page.getByRole('textbox', { name: 'Clip name', exact: true }).fill('Square excerpt');
  await page
    .getByRole('textbox', { name: 'Creative direction', exact: true })
    .fill('Keep the opening reveal.');
  await page.getByRole('button', { name: 'Create clip', exact: true }).click();
  await expect(
    page.getByText('Initial clip direction: Keep the opening reveal.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'All clips', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Clip packaging', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await finishClip(desktopApp);
  await expect(page.getByRole('region', { name: 'Clip packaging', exact: true })).toBeVisible();
  await expect(page.getByText('The first clip is ready.', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Initial clip direction: Keep the opening reveal.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.preview-stage')).toHaveCSS('aspect-ratio', '1 / 1');
  const titles = page.getByRole('textbox', { name: 'Titles', exact: true });
  await expect(titles).toHaveValue('Clip short title');
  await titles.fill('Edited square title');
  await expect(page.getByRole('button', { name: 'All clips', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: 'Commit title', exact: true })).toHaveValue(
    'Review clip title',
  );
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(titles).toHaveValue('Edited square title');
  await page
    .locator('label.field')
    .filter({ has: titles })
    .getByRole('button', { name: 'Work on this with AI', exact: true })
    .click();
  await expect(page.locator('.chat-tab.active')).toContainText('Titles · short form');
  await page.getByRole('button', { name: 'Return to editing', exact: true }).click();
  await expect(
    page.getByText('Initial clip direction: Keep the opening reveal.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'AI chat', exact: true }).fill('Add a stronger ending.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const requests = await clipRequests(desktopApp);
  expect(requests.find((request) => request.method === 'createClip')?.input).toMatchObject({
    name: 'Square excerpt',
    ratio: '1:1',
    start: 5,
    end: 6,
    prompt: 'Keep the opening reveal.',
  });
  expect(requests.find((request) => request.method === 'saveWorkspace')?.input).toMatchObject({
    scope: { clipId: 'created-clip' },
    packaging: { titles: { short: ['Edited square title'] } },
  });
  expect(
    requests
      .filter((request) => request.method === 'openChat')
      .some((request) => {
        const value = request.input as { topic: string; scope: { clipId: string | null } };
        return value.topic === 'packaging:title:short' && value.scope.clipId === 'created-clip';
      }),
  ).toBe(true);
  expect(requests.find((request) => request.method === 'sendChat')?.input).toMatchObject({
    sessionId: 'created-clip:clip',
    text: 'Add a stronger ending.',
  });
  await page.getByRole('button', { name: 'All clips', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clips', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview Square excerpt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preview Square excerpt', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.clip-player video')
        .evaluate((node: HTMLVideoElement) => !node.paused && node.currentTime > 0),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator('.clip-player video')
        .evaluate((node: HTMLVideoElement) => node.videoWidth / node.videoHeight),
    )
    .toBe(1);
  await expect(page.locator('.clip-player video')).toHaveCSS('object-fit', 'contain');
  await page.locator('.clip-player video').evaluate((node: HTMLVideoElement) => {
    node.pause();
  });
  await page.getByRole('button', { name: 'Preview Square excerpt', exact: true }).click();
  await expect
    .poll(() => page.locator('.clip-player video').evaluate((node: HTMLVideoElement) => node.paused))
    .toBe(false);
  await page.getByRole('button', { name: 'Packaging', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveValue('Test title');
});

test('preserves the selected range and direction after a failed create, then allows cancelling the first turn', async ({
  desktopApp,
  page,
}) => {
  await installClipsFixture(desktopApp, 'before');
  await openForm(page);
  await page.getByRole('textbox', { name: 'Clip name', exact: true }).fill('Retry portrait');
  await page
    .getByRole('textbox', { name: 'Creative direction', exact: true })
    .fill('Keep this direction after retry.');
  const start = page.getByRole('spinbutton', { name: 'Start (seconds)', exact: true });
  const end = page.getByRole('spinbutton', { name: 'End (seconds)', exact: true });
  await start.fill('10');
  await end.fill('20');
  await page.getByRole('button', { name: 'Create clip', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Clip preparation failed');
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await expect(start).toHaveValue('10');
  await expect(end).toHaveValue('20');
  await expect(page.getByRole('textbox', { name: 'Creative direction', exact: true })).toHaveValue(
    'Keep this direction after retry.',
  );
  await page.getByRole('button', { name: 'Create clip', exact: true }).click();
  await expect(
    page.getByText('Initial clip direction: Keep this direction after retry.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByText('Stopped; your clip files were preserved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All clips', exact: true })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveAttribute(
    'contenteditable',
    'true',
  );
  await page.getByRole('button', { name: 'All clips', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview Retry portrait', exact: true })).toBeVisible();
});

test('shows a preserved clip when generation cannot start after its repository was created', async ({
  desktopApp,
  page,
}) => {
  await installClipsFixture(desktopApp, 'after');
  await openForm(page);
  await page.getByRole('textbox', { name: 'Clip name', exact: true }).fill('Preserved draft');
  await page.getByRole('button', { name: 'Create clip', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Clip saved, but Codex could not start.');
  await page.getByRole('button', { name: 'All clips', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview Preserved draft', exact: true })).toBeVisible();
  await page
    .locator('.clips-preview-heading')
    .getByRole('button', { name: 'Edit clip', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Clip packaging', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'AI chat', exact: true })).toHaveAttribute(
    'contenteditable',
    'true',
  );
});
