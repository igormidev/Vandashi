import { test, expect } from './fixtures';
import {
  installPackagingRegressionFixture,
  packagingRequests,
  addRenderCommit,
} from './packaging-regression-fixture';

test('edits and reorders a library larger than 500 thumbnails without dropping candidates', async ({
  desktopApp,
  page,
}) => {
  await installPackagingRegressionFixture(desktopApp, 501);
  await page.reload();
  const thumbnails = page.locator('.thumbnail');
  await expect(thumbnails).toHaveCount(501);
  await page.getByRole('textbox', { name: 'Titles', exact: true }).fill('Reviewed library title');
  await thumbnails.last().getByRole('button', { name: 'Move earlier', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = (await packagingRequests(desktopApp)).saves[0]?.packaging;
  expect(saved?.titles.long).toEqual(['Reviewed library title']);
  const originalOrder = Array.from({ length: 501 }, (_, index) => `thumbnails/portrait-${String(index)}.svg`);
  expect(saved?.thumbnails).toEqual([
    ...originalOrder.slice(0, 499),
    'thumbnails/portrait-500.svg',
    'thumbnails/portrait-499.svg',
  ]);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveValue(
    'Reviewed library title',
  );
  await expect(thumbnails).toHaveCount(501);
});

test('preserves multiword tag typing, dirty locks, format drafts, and uncropped thumbnail display', async ({
  desktopApp,
  page,
}) => {
  await installPackagingRegressionFixture(desktopApp);
  await page.reload();
  const tags = page.getByRole('textbox', { name: 'Tags', exact: true });
  const addTag = page.getByRole('button', { name: 'Add tag', exact: true });
  await addTag.click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await tags.first().pressSequentially('hidden city');
  await addTag.click();
  await tags.last().pressSequentially('blue hour');
  await expect(tags.first()).toHaveValue('hidden city');
  await expect(tags.last()).toHaveValue('blue hour');
  await expect(page.getByRole('button', { name: 'Creation workspace', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Short form', exact: true }).click();
  await expect(tags).toHaveCount(0);
  await addTag.click();
  await tags.pressSequentially('quiet streets');
  await page.getByRole('button', { name: 'Long form', exact: true }).click();
  await expect(tags.first()).toHaveValue('hidden city');
  await expect(tags.last()).toHaveValue('blue hour');
  const thumbnail = page.locator('.thumbnail img');
  await expect(thumbnail).toHaveCSS('object-fit', 'contain');
  await expect
    .poll(() => thumbnail.evaluate((element) => (element as HTMLImageElement).naturalHeight))
    .toBe(600);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await packagingRequests(desktopApp)).saves[0]?.packaging?.tags).toEqual({
    long: ['hidden city', 'blue hour'],
    short: ['quiet streets'],
  });
});

test('returns to the newest history page after a manifest-only commit with unchanged source revision', async ({
  desktopApp,
  page,
}) => {
  await installPackagingRegressionFixture(desktopApp);
  await page.reload();
  await page.getByRole('button', { name: 'Creation workspace', exact: true }).click();
  await expect(page.locator('.commit')).toHaveCount(12);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.commit').first()).toContainText('Revision 12');
  await addRenderCommit(desktopApp);
  await expect(page.locator('.commit').first()).toContainText('Record rendered output');
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
});

test('offers keyboard asset mentions in script guidance and preserves them after cancellation and handoff failure', async ({
  desktopApp,
  page,
}) => {
  await installPackagingRegressionFixture(desktopApp);
  await page.reload();
  await page.getByRole('button', { name: 'Creation workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Script', exact: true }).fill('# Show the blue city');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const guidance = page.getByRole('textbox', { name: 'Direction for AI', exact: true });
  await guidance.pressSequentially('Use @blue');
  await expect(page.getByRole('option', { name: 'Blue city', exact: true })).toBeVisible();
  await guidance.press('Enter');
  await expect(guidance.locator('.file-mention')).toHaveText('Blue city');
  await guidance.press('Enter');
  await guidance.pressSequentially('Keep it quiet.');
  expect((await packagingRequests(desktopApp)).scripts).toHaveLength(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(guidance.locator('.file-mention')).toHaveText('Blue city');
  await page.getByRole('button', { name: 'Save & create', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Fixture AI unavailable');
  await expect(guidance.locator('.file-mention')).toHaveText('Blue city');
  expect((await packagingRequests(desktopApp)).scripts[0]?.guidance).toBe(
    'Use @[Blue city](</tmp/chat-test/videos/video/video_assets/blue city.png>) \nKeep it quiet.',
  );
});
