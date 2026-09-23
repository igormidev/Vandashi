import { test, expect } from './fixtures';
import { chatControl, chatRequests, installChatFixture } from './chat-fixture';

const commitBody = 'Opening scene\nTighten the title\nPreserve timing\nUse the shared logo';

test('restores brand drafts after cancel and accepts a reviewed manual commit when AI is unavailable', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, false, { references: true, commitFails: true });
  await page.reload();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Quiet Stories');
  const guide = page.getByRole('textbox', { name: 'Visual identity', exact: true });
  await guide.fill('Keep the opening calm.\nUse one accent color.');
  await page.getByRole('button', { name: 'Increase text size', exact: true }).click();
  await expect(guide).toHaveCSS('font-size', '13px');
  await expect(page.getByRole('button', { name: 'Videos', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Save a version', exact: true });
  await expect(dialog.getByRole('textbox', { name: 'Commit title', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('textbox', { name: 'Commit title', exact: true })).toHaveValue('');
  await expect(dialog.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(guide).toHaveValue('Keep the opening calm.\nUse one accent color.');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Save a version', exact: true });
  await dialog.getByRole('textbox', { name: 'Commit title', exact: true }).fill('Refine visual identity');
  await dialog
    .getByRole('textbox', { name: 'What changed', exact: true })
    .fill('Use a calm opening and a single accent color.');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Videos', exact: true })).toBeEnabled();
  await expect(guide).toHaveValue('Keep the opening calm.\nUse one accent color.');
  expect(await chatRequests(desktopApp)).toContainEqual(
    expect.objectContaining({
      method: 'saveWorkspace',
      input: expect.objectContaining({
        brandConfig: expect.objectContaining({ name: 'Quiet Stories' }),
        documents: [expect.objectContaining({ content: 'Keep the opening calm.\nUse one accent color.' })],
      }),
    }),
  );
});

test('retains separate long and short packaging drafts through commit confirmation', async ({
  desktopApp,
  page,
}) => {
  await installChatFixture(desktopApp, true);
  await page.reload();
  await page
    .getByRole('button', {
      name: 'The first image is the main thumbnail. Reorder alternatives for A/B tests.',
      exact: true,
    })
    .hover();
  await expect(page.getByRole('tooltip').locator('strong')).toHaveText('main thumbnail');
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: 'Titles', exact: true }).fill('A hidden city\nThe city beneath us');
  await page.getByRole('button', { name: 'Short form', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveValue('Short title');
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('A glimpse beneath the surface.');
  await page.getByRole('button', { name: 'Long form', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toHaveValue(
    'A hidden city\nThe city beneath us',
  );
  await expect(page.getByRole('button', { name: 'Creation workspace', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a version', exact: true });
  await dialog.getByRole('textbox', { name: 'Commit title', exact: true }).fill('Prepare release titles');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  const requests = await chatRequests(desktopApp);
  expect(requests).toContainEqual(
    expect.objectContaining({
      method: 'saveWorkspace',
      input: expect.objectContaining({
        packaging: expect.objectContaining({
          titles: { long: ['A hidden city', 'The city beneath us'], short: ['Short title'] },
          descriptions: { long: '', short: 'A glimpse beneath the surface.' },
        }),
        commit: expect.objectContaining({ title: 'Prepare release titles' }),
      }),
    }),
  );
});

test('paginates actual history and resets to the newest page after changes while expanding short multiline bodies', async ({
  desktopApp,
  page,
}) => {
  const history = Array.from({ length: 26 }, (_, index) => ({
    sha: String(index).padStart(40, '0'),
    title: `Revision ${String(index)}`,
    body: commitBody,
    date: '2026-09-23T12:00:00Z',
    files: [{ path: 'script.md', additions: 1, deletions: 1, diff: '-Old opening\n+New opening' }],
  }));
  await installChatFixture(desktopApp, true, { history });
  await page.reload();
  await page.getByRole('button', { name: 'Creation workspace', exact: true }).click();
  await expect(page.locator('.commit')).toHaveCount(12);
  await page.locator('.commit').first().getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(
    page.locator('.commit').first().getByRole('button', { name: 'Show less', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.commit').first().locator('summary').click();
  await expect(page.locator('.commit').first().locator('pre')).toContainText('+New opening');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.commit').first()).toContainText('Revision 12');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.commit')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);
  await chatControl(desktopApp, { reload: true });
  await expect(page.locator('.commit')).toHaveCount(12);
  await expect(page.locator('.commit').first()).toContainText('Revision 0');
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
});

test('persists independent automatic-operation model preferences', async ({ desktopApp, page }) => {
  await installChatFixture(desktopApp);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  const modelFields = dialog
    .locator('.field')
    .filter({ has: page.getByRole('combobox', { name: 'Model', exact: true }) });
  await expect(modelFields).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    const field = modelFields.nth(index);
    await field.getByRole('combobox', { name: 'Model', exact: true }).selectOption('test-model');
    await field
      .getByRole('combobox', { name: 'Thinking', exact: true })
      .selectOption(index === 3 ? 'high' : 'low');
  }
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(modelFields.nth(3).getByRole('combobox', { name: 'Thinking', exact: true })).toHaveValue(
    'high',
  );
  await expect(modelFields.nth(2).getByRole('combobox', { name: 'Thinking', exact: true })).toHaveValue(
    'low',
  );
});
