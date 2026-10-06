import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import type { IpcMainInvokeEvent } from 'electron';
import { LocalGit } from '../../src/infrastructure/git/local-git';
import { test, expect } from './fixtures';

async function createBrand(application: ElectronApplication, page: Page, parent: string) {
  await application.evaluate(({ ipcMain, dialog }, selected) => {
    type Invoke = (event: IpcMainInvokeEvent, method: unknown, args: unknown) => unknown;
    const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Invoke> })._invokeHandlers.get(
      'vandashi:invoke',
    );
    if (!invoke) throw new Error('Missing production desktop handler');
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (event, method, args) => {
      if (method === 'models') return [];
      if (method === 'checks')
        return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
      if (method === 'suggestCommit')
        return { title: 'Save reviewed guide', body: 'Update this editing preset.' };
      return invoke(event, method, args);
    });
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selected] });
  }, parent);
  const workspace = await page.evaluate(async () => {
    const api = window.vandashi;
    if (!api) throw new Error('Missing production API');
    const parentPath = await api.chooseDirectory();
    if (!parentPath) throw new Error('Missing native directory grant');
    const brand = await api.createBrand({ parentPath, name: 'Reconstruction studio' });
    return api.openBrand(brand.id);
  });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Reconstruction studio');
  return workspace;
}

function pdfFixture() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 6 0 R >>',
    '<< /Length 27 >>\nstream\n1 0 0 rg 20 20 80 80 re f\n\nendstream',
    '<< /Length 27 >>\nstream\n0 0 1 rg 20 20 80 80 re f\n\nendstream',
  ];
  let content = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(content.length);
    content += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xref = content.length;
  content += `xref\n0 7\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return content;
}

test('native browser discovery and narrow Brand controls retain section locks and platform contrast', async ({
  desktopApp,
  page,
  userData,
}) => {
  await createBrand(desktopApp, page, userData);
  const browsers = await page.evaluate(() => window.vandashi?.installedBrowsers());
  expect(browsers?.length).toBeGreaterThan(0);
  expect(browsers?.some((browser) => browser.icon?.startsWith('data:image/'))).toBe(true);
  await page.locator('.browser-select').first().click();
  await expect(page.locator('.browser-choice')).toHaveCount(browsers?.length ?? 0);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.brand-panel').evaluate((element) => {
    (element as HTMLElement).style.width = '260px';
  });
  expect(
    await page.locator('.brand-panel').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  const columns = await page
    .locator('.platform-field')
    .first()
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(2);
  await page.getByRole('button', { name: 'Show all', exact: true }).click();
  await expect(page.locator('.platform-field').nth(5).locator('svg').first()).toHaveAttribute(
    'fill',
    'currentColor',
  );
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Manual identity');
  await expect(page.locator('.brand-panel fieldset').last()).toHaveAttribute('disabled', '');
  await page
    .locator('.section-actions')
    .first()
    .getByRole('button', { name: 'Discard changes', exact: true })
    .click();
  await expect(page.locator('.brand-panel fieldset').last()).not.toHaveAttribute('disabled');
  await page.locator('.brand-panel').evaluate((element) => {
    (element as HTMLElement).style.width = '';
  });
  await page.screenshot({ path: '/tmp/vandashi-reconstruction-brand.png' });
});

test('production presets render PDF pages and inert HTML, preserve guide saves and enforce pane minima', async ({
  desktopApp,
  page,
  userData,
}) => {
  const initial = await createBrand(desktopApp, page, userData);
  await page.evaluate((scope) => window.vandashi?.ensurePresets(scope), initial.scope);
  const root = join(initial.brand.path, 'edition_presets');
  const preset = join(root, 'Clean cuts');
  await mkdir(preset);
  await writeFile(
    join(preset, 'HOW_TO_USE.md'),
    '# Clean cuts\nUse `reference.pdf` and [the layout](layout.html), [encoded name](Cover%20%231.txt), and `Cover #1.txt`.\n',
  );
  await writeFile(join(preset, 'reference.pdf'), pdfFixture());
  await writeFile(join(preset, 'Cover #1.txt'), 'Known contained file with hash in name.');
  await writeFile(join(preset, 'layout.html'), '<script>window.previewExecuted=true</script><h1>Layout</h1>');
  const git = new LocalGit();
  await git.commit(root, 'Add clean cuts', 'Add real local guide and supporting files.');
  await page.getByRole('navigation').getByRole('button', { name: 'Editing presets', exact: true }).click();
  await expect(page.locator('.preset-markdown')).toContainText('Clean cuts');
  await expect(
    page.locator('.preset-markdown').getByRole('button', { name: 'encoded name', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.preset-markdown').getByRole('button', { name: 'Cover #1.txt', exact: true }),
  ).toBeVisible();
  await page.locator('.preset-markdown').getByRole('button', { name: 'reference.pdf', exact: true }).click();
  const canvas = page.locator('.pdf-pages canvas');
  await expect(canvas).toHaveAttribute('width', '260');
  await expect(page.locator('.pdf-controls')).toContainText('Page 1 of 2');
  await page.locator('.pdf-controls').getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.pdf-controls')).toContainText('Page 2 of 2');
  await page
    .locator('.pdf-controls')
    .getByRole('button', { name: 'Increase text size', exact: true })
    .click();
  await expect(canvas).toHaveAttribute('width', '325');
  await page.getByRole('button', { name: 'Preset guide', exact: true }).click();
  await page.locator('.preset-markdown').getByRole('button', { name: 'the layout', exact: true }).click();
  await expect(page.locator('.file-viewer pre')).toContainText(
    '<script>window.previewExecuted=true</script>',
  );
  expect(await page.evaluate(() => 'previewExecuted' in window)).toBe(false);
  await page.getByRole('button', { name: 'Preset guide', exact: true }).click();
  await page.locator('.preset-guide').getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Preset guide', exact: true })
    .fill('# Clean cuts\nUpdated actual guide.\n');
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Brand', exact: true }),
  ).toBeDisabled();
  await page
    .locator('.preset-guide .savebar')
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await readFile(join(preset, 'HOW_TO_USE.md'), 'utf8')).toContain('Updated actual guide.');
  expect((await git.status(root)).dirty).toBe(false);
  const handle = page.getByRole('slider', { name: 'Resize panels', exact: true }).first();
  for (let index = 0; index < 15; index++) await handle.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '25');
  const widths = await page
    .locator('.triple-split > section')
    .evaluateAll((sections) => sections.map((section) => section.getBoundingClientRect().width));
  const total = widths.reduce((sum, width) => sum + width, 0);
  expect(widths.every((width) => width / total >= 0.249)).toBe(true);
  await page.screenshot({ path: '/tmp/vandashi-reconstruction-presets.png' });
});

test('native pasted artifacts reject changed bytes and shared asset tags save through real Git', async ({
  desktopApp,
  page,
  userData,
}) => {
  const initial = await createBrand(desktopApp, page, userData);
  const bytes = await desktopApp.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromBitmap(Buffer.from([0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255]), {
        width: 2,
        height: 2,
      })
      .toPNG()
      .toString('base64'),
  );
  const pasted = await page.evaluate((base64) => window.vandashi?.storePastedImage(base64), bytes);
  if (!pasted) throw new Error('Missing normalized pasted artifact');
  expect(await page.evaluate((path) => window.vandashi?.filePreview(path), pasted)).toMatchObject({
    kind: 'image',
  });
  await writeFile(pasted, 'replaced');
  expect(
    await page.evaluate(async (path) => {
      try {
        await window.vandashi?.filePreview(path);
        return false;
      } catch {
        return true;
      }
    }, pasted),
  ).toBe(true);
  const source = join(userData, 'mark.svg');
  await writeFile(
    source,
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#0f0"/></svg>',
  );
  await desktopApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
  }, source);
  await page.evaluate(async (scope) => {
    const api = window.vandashi;
    if (!api) throw new Error('Missing production API');
    const [sourcePath] = await api.chooseFiles('assets');
    if (!sourcePath) throw new Error('Missing native asset grant');
    await api.importAsset({
      scope,
      draft: {
        sourcePath,
        title: 'Green mark',
        description: 'A green square',
        tags: ['identity'],
        kind: 'image',
      },
    });
  }, initial.scope);
  await page.getByRole('navigation').getByRole('button', { name: 'Shared assets', exact: true }).click();
  await page.locator('.asset-tile').click();
  const inspector = page.locator('.asset-inspector');
  await expect(inspector.locator('.asset-dates time')).toHaveCount(2);
  await inspector.getByRole('button', { name: 'Add tag', exact: true }).click();
  const save = inspector.getByRole('button', { name: 'Save changes', exact: true });
  await expect(save).toBeDisabled();
  await inspector.getByRole('textbox', { name: 'Tags', exact: true }).last().fill('green square');
  await save.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const restored = await page.evaluate((scope) => window.vandashi?.openWorkspace(scope), initial.scope);
  expect(restored?.assets[0]?.tags).toEqual(['identity', 'green square']);
  expect((await new LocalGit().status(join(initial.brand.path, 'shared_assets'))).dirty).toBe(false);
  await page.screenshot({ path: '/tmp/vandashi-reconstruction-assets.png' });
});
