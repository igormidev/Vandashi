import type { ElectronApplication } from '@playwright/test';
import type { IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ptBR from '../../src/renderer/locales/pt-BR.json' with { type: 'json' };
import { test, expect } from './fixtures';

async function preservingClipboard(application: ElectronApplication, task: () => Promise<void>) {
  // Keep the original native items in the main process; never serialize private clipboard data.
  const saved = await application.evaluateHandle(async ({ clipboard, ClipboardItem }) => {
    const items = await Promise.all(
      (await clipboard.read()).map(async (item) => {
        const entries = await Promise.all(
          item.types.map(async (type) => [type, await item.getType(type)] as const),
        );
        return new ClipboardItem(Object.fromEntries(entries));
      }),
    );
    return {
      restore: async () => {
        if (items.length) await clipboard.write(items);
        else clipboard.clear();
      },
    };
  });
  try {
    // Verify the snapshot is writable before a test changes the clipboard.
    await saved.evaluate((state) => state.restore());
    await task();
  } finally {
    await saved.evaluate((state) => state.restore());
    await saved.dispose();
  }
}

async function allowAccountIndependentEntry(application: ElectronApplication, directory: string) {
  await application.evaluate(({ ipcMain, dialog }, selected) => {
    // Isolate account readiness only. Clipboard permissions, native writes, storage, Git,
    // media grants, history, and Studio all retain their production implementations.
    type Invoke = (event: IpcMainInvokeEvent, method: unknown, args: unknown) => unknown;
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Invoke> })._invokeHandlers;
    const invoke = handlers.get('vandashi:invoke');
    if (!invoke) throw new Error('Missing production desktop handler');
    ipcMain.removeHandler('vandashi:invoke');
    ipcMain.handle('vandashi:invoke', (event, method: unknown, args: unknown) => {
      if (method === 'models') return [];
      if (method === 'checks')
        return [{ id: 'Ready', status: 'ready', detail: '', repairPrompt: null, helpUrl: null }];
      return invoke(event, method, args);
    });
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selected] });
  }, directory);
}

async function expectCopiedPixel(application: ElectronApplication) {
  expect(
    await application.evaluate(async ({ clipboard, nativeImage }) => {
      const items = await clipboard.read();
      const image = items.find((item) => item.types.includes('image/png'));
      if (!image) return null;
      const blob = await image.getType('image/png');
      if (!(blob instanceof Blob)) return null;
      const bytes = await blob.arrayBuffer();
      return nativeImage.createFromBuffer(Buffer.from(bytes)).getSize();
    }),
  ).toEqual({ width: 1, height: 1 });
}

test('copies the real history SHA in the localized production renderer and denies reads and Studio writes', async ({
  desktopApp,
  page,
  userData,
}) => {
  test.setTimeout(90_000);
  await preservingClipboard(desktopApp, async () => {
    await allowAccountIndependentEntry(desktopApp, userData);
    const sha = await page.evaluate(async () => {
      const api = window.vandashi;
      if (!api) throw new Error('Missing desktop API');
      const parentPath = await api.chooseDirectory();
      if (!parentPath) throw new Error('Missing native directory grant');
      const brand = await api.createBrand({ parentPath, name: 'Clipboard test brand' });
      const workspace = await api.createVideo({ brandId: brand.id, name: 'Clipboard film', ratio: '16:9' });
      const state = await api.getState();
      await api.settings({ ...state.settings, locale: 'pt-BR' });
      const history = await api.history({ scope: workspace.scope, page: 0 });
      const latest = history.commits[0];
      if (!latest) throw new Error('The real Git history must contain the initial commit');
      return latest.sha;
    });
    await page.reload();
    await page.getByRole('navigation').getByRole('button', { name: ptBR.videos, exact: true }).click();
    await page.getByRole('button', { name: 'Clipboard film', exact: true }).click();
    await page.getByRole('button', { name: ptBR.creation, exact: true }).click();
    await page.getByRole('button', { name: ptBR.commitSha, exact: true }).first().click();
    await expect(page.getByRole('status')).toHaveText(ptBR.copied);
    expect(await desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(sha);
    expect(
      await page.evaluate(async () => {
        try {
          await navigator.clipboard.readText();
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    await page.getByRole('button', { name: ptBR.manual, exact: true }).click();
    const studio = page.locator('iframe.studio-frame');
    await expect(studio).toBeVisible();
    // Even explicit browser delegation cannot turn the embedded editor into the trusted app frame.
    await studio.evaluate((element) => {
      element.setAttribute('allow', 'clipboard-read *; clipboard-write *');
    });
    const body = page.frameLocator('iframe.studio-frame').locator('body');
    await expect(body).toBeVisible();
    expect(
      await body.evaluate(async () => {
        const outcomes = [];
        for (const operation of [
          () => navigator.clipboard.writeText('untrusted Studio replacement'),
          () => navigator.clipboard.readText(),
        ]) {
          try {
            await operation();
            outcomes.push(false);
          } catch {
            outcomes.push(true);
          }
        }
        return outcomes;
      }),
    ).toEqual([true, true]);
    expect(await desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(sha);
  });
});

test('copies shared asset images from brand and video pages through the constrained native port', async ({
  desktopApp,
  page,
  userData,
}) => {
  await preservingClipboard(desktopApp, async () => {
    await allowAccountIndependentEntry(desktopApp, userData);
    const brand = await page.evaluate(async () => {
      const api = window.vandashi;
      if (!api) throw new Error('Missing desktop API');
      const parentPath = await api.chooseDirectory();
      if (!parentPath) throw new Error('Missing native directory grant');
      return api.createBrand({ parentPath, name: 'Clipboard image brand' });
    });
    const source = join(userData, 'copy-pixel.png');
    await writeFile(
      source,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    await desktopApp.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [selected] });
    }, source);
    await page.evaluate(async (brandId) => {
      const api = window.vandashi;
      if (!api) throw new Error('Missing desktop API');
      const [sourcePath] = await api.chooseFiles('images');
      if (!sourcePath) throw new Error('Missing native image grant');
      await api.importAsset({
        scope: { brandId, videoId: null, clipId: null },
        draft: { sourcePath, title: 'Copy pixel', description: 'A test image', tags: [], kind: 'image' },
      });
    }, brand.id);
    await page.reload();
    await page.getByRole('navigation').getByRole('button', { name: 'Shared assets', exact: true }).click();
    await page.locator('.asset-tile').filter({ hasText: 'Copy pixel' }).click();
    await page.getByRole('button', { name: 'Copy image', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Copied');
    await expectCopiedPixel(desktopApp);
    await page.evaluate(async (brandId) => {
      const api = window.vandashi;
      if (!api) throw new Error('Missing desktop API');
      await api.createVideo({ brandId, name: 'Clipboard image film', ratio: '16:9' });
    }, brand.id);
    await page.reload();
    await page.getByRole('navigation').getByRole('button', { name: 'Videos', exact: true }).click();
    await page.getByRole('button', { name: 'Clipboard image film', exact: true }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Assets', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Search names, descriptions, and tags', exact: true })
      .fill('Copy pixel');
    await page.locator('.asset-tile').filter({ hasText: 'Copy pixel' }).click();
    await expect(page.getByRole('textbox', { name: 'Asset title', exact: true })).toBeDisabled();
    await desktopApp.evaluate(({ clipboard }) => {
      clipboard.clear();
    });
    await page.getByRole('button', { name: 'Copy image', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Copied');
    await expectCopiedPixel(desktopApp);
  });
});
