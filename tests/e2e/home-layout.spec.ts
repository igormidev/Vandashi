import { test, expect } from './fixtures';
import { chatFixtureData } from './chat-fixture-data';
import { installChatFixture } from './chat-fixture';

test('keeps every brand reachable at the minimum size with long names and paths', async ({
  desktopApp,
  page,
}) => {
  const fixture = chatFixtureData(false, {});
  fixture.state.lastBrandId = null;
  fixture.state.brands = Array.from({ length: 24 }, (_, index) => ({
    ...fixture.workspace.brand,
    id: `brand-${String(index)}`,
    name: index === 0 ? 'W'.repeat(100) : `Brand ${String(index + 1)}`,
    config: {
      ...fixture.workspace.brand.config,
      name: index === 0 ? 'W'.repeat(100) : `Brand ${String(index + 1)}`,
    },
    path: `/tmp/${'long-folder-name'.repeat(25)}/brand-${String(index)}`,
    lastOpened: '2026-09-23T10:00:00Z',
  }));
  await desktopApp.evaluate(({ ipcMain, BrowserWindow }, fixture) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1200, 720);
    let workspace = fixture.workspace;
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (_event, method: string, args: unknown[]) => {
      if (method === 'prepareTranscriptions') return { status: 'ready' };
      if (method === 'prepareTranscriptionModel') return undefined;
      if (method === 'getState') return fixture.state;
      if (method === 'models') return fixture.models;
      if (method === 'sessions') return [];
      if (method === 'openWorkspace') return workspace;
      if (method === 'checks')
        return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
      if (method === 'openBrand') {
        const brand = fixture.state.brands.find((entry) => entry.id === args[0]);
        if (!brand) throw new Error('Unknown selected brand');
        workspace = {
          ...fixture.workspace,
          brand: { ...brand, config: { ...fixture.workspace.brand.config, name: brand.name } },
          scope: { ...fixture.workspace.scope, brandId: brand.id },
        };
        return workspace;
      }
      throw new Error(`Unexpected home method ${method}`);
    });
  }, fixture);
  await page.reload();
  const list = page.locator('.brand-list');
  await expect(list.locator('.brand-row')).toHaveCount(24);
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const first = list.locator('.brand-row').first();
  expect(await first.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await first.focus();
  for (let index = 1; index < 24; index++) await page.keyboard.press('Tab');
  const last = list.locator('.brand-row').last();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Create a brand', exact: true })).toBeInViewport();
  await page.screenshot({ path: '/tmp/vandashi-brand-list-minimum.png' });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Brand 24');
  await expect(page.getByRole('button', { name: 'Brand 24', exact: true })).toBeVisible();
});

for (const video of [false, true]) {
  test(`exposes the current ${video ? 'video' : 'brand'} destination through shared navigation`, async ({
    desktopApp,
    page,
  }) => {
    await installChatFixture(desktopApp, video);
    await page.reload();
    const navigation = page.getByRole('navigation');
    const initial = video ? 'Packaging' : 'Brand';
    const next = video ? 'Assets' : 'Shared assets';
    await expect(navigation.getByRole('button', { name: initial, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await navigation.getByRole('button', { name: next, exact: true }).click();
    await expect(navigation.getByRole('button', { name: next, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(navigation.getByRole('button', { name: initial, exact: true })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });
}
