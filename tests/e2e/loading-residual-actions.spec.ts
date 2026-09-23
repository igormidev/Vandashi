import type { IpcMainInvokeEvent } from 'electron';
import type { Asset } from '../../src/domain/models';
import { test, expect } from './development-fixtures';
import { installChatFixture } from './chat-fixture';
import {
  installFeedbackHolds,
  feedbackControl,
  feedbackState,
  expectPending,
} from './loading-feedback-fixture';
import { installNavigationFixture, navigationControl } from './workspace-navigation-fixture';
import { installStartupFixture, startupControl } from './startup-development-fixture';

for (const video of [false, true]) {
  test(`${video ? 'video' : 'shared'} image copy shows progress and prevents duplicate writes through failure/retry`, async ({
    desktopApp,
    page,
  }) => {
    const asset: Asset = {
      id: 'image',
      path: '/tmp/image.png',
      relativePath: 'image.png',
      title: 'Reviewed image',
      description: '',
      tags: [],
      kind: 'image',
      size: 100,
      hash: '',
      revision: 'a'.repeat(64),
      shared: !video,
      mediaUrl: '',
    };
    await installChatFixture(desktopApp, video, { assets: [asset] });
    await desktopApp.evaluate(({ ipcMain }) => {
      type Invoke = (event: IpcMainInvokeEvent, method: string, args: unknown[]) => unknown;
      const invoke = (ipcMain as unknown as { _invokeHandlers: Map<string, Invoke> })._invokeHandlers.get(
        'vandashi:invoke',
      );
      if (!invoke) throw new Error('Missing fixture handler');
      ipcMain.removeHandler('vandashi:invoke');
      ipcMain.handle('vandashi:invoke', (event, method: string, args: unknown[]) =>
        method === 'copyImage' ? undefined : invoke(event, method, args),
      );
    });
    await installFeedbackHolds(desktopApp, ['copyImage']);
    await page.reload();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: video ? 'Assets' : 'Shared assets', exact: true })
      .click();
    await page.locator('.asset-tile').click();
    const copy = page.getByRole('button', { name: 'Copy image', exact: true });
    await copy.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expectPending(copy);
    await expect.poll(async () => (await feedbackState(desktopApp)).pending.length).toBe(1);
    await feedbackControl(desktopApp, { finish: { method: 'copyImage', fail: true } });
    await expect(copy).toBeEnabled();
    await expect(copy.locator('svg.spin')).toHaveCount(0);
    await copy.click();
    await expectPending(copy);
    await feedbackControl(desktopApp, { finish: { method: 'copyImage' } });
    await expect(copy).toBeEnabled();
    await expect(copy).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.toast')).toHaveText('Copied');
  });
}

test('history SHA copy retains its owned wait until the browser clipboard promise settles', async ({
  desktopApp,
  page,
}) => {
  const sha = 'a'.repeat(40);
  await installChatFixture(desktopApp, true, {
    history: [{ sha, title: 'Saved revision', body: '', date: '2026-09-23T10:00:00Z', files: [] }],
  });
  await page.reload();
  await page.getByRole('button', { name: 'Creation workspace', exact: true }).click();
  await page.evaluate(() => {
    let complete: ((fail: boolean) => void) | undefined;
    let requests = 0;
    // The production clipboard-policy/native-byte tests cover delivery; this holds its browser await.
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: (value: string) => {
        document.documentElement.dataset.copyRequests = String(++requests);
        document.documentElement.dataset.copyValue = value;
        return new Promise<void>((resolve, reject) => {
          complete = (fail) => {
            if (fail) reject(new Error('Clipboard write failed.'));
            else resolve();
          };
        });
      },
    });
    window.addEventListener('vandashi:finish-copy', (event) => {
      complete?.((event as CustomEvent<boolean>).detail);
    });
  });
  const copy = page.getByRole('button', { name: 'Copy commit SHA', exact: true });
  await copy.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expectPending(copy);
  await expect(page.locator('html')).toHaveAttribute('data-copy-requests', '1');
  await expect(page.locator('html')).toHaveAttribute('data-copy-value', sha);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vandashi:finish-copy', { detail: true })));
  await expect(copy).toBeEnabled();
  await expect(copy.locator('svg.spin')).toHaveCount(0);
  await copy.click();
  await expectPending(copy);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vandashi:finish-copy', { detail: false })));
  await expect(copy).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.toast')).toHaveText('Copied');
});

for (const target of ['Packaging', 'Vandashi', 'Chat test brand']) {
  test(`${target} navigation exposes a local spinner at minimum width through Studio flush failure/retry`, async ({
    desktopApp,
    page,
  }) => {
    await installChatFixture(desktopApp, true);
    await desktopApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1200, 720);
    });
    await page.reload();
    await page.getByRole('button', { name: 'Manual editing', exact: true }).click();
    await expect(page.locator('iframe.studio-frame')).toBeVisible();
    await installFeedbackHolds(desktopApp, ['studioChanges']);
    const action = page.getByRole('button', { name: target, exact: true });
    await action.click();
    await expectPending(action);
    await expect(action.locator('svg.spin')).toBeInViewport();
    await feedbackControl(desktopApp, { finish: { method: 'studioChanges', fail: true } });
    await expect(action).toBeEnabled();
    await expect(action.locator('svg.spin')).toHaveCount(0);
    await expect(page.locator('iframe.studio-frame')).toBeVisible();
    await action.click();
    await expectPending(action);
    await feedbackControl(desktopApp, { finish: { method: 'studioChanges' } });
    await expect(page.locator('iframe.studio-frame')).toHaveCount(0);
    await expect(page.locator('.nav svg.spin, .wordmark svg.spin, .crumb svg.spin')).toHaveCount(0);
  });
}

test('a superseded parent read clears only its owned navigation indicator and leaves the adopted clip intact', async ({
  desktopApp,
  page,
}) => {
  await installNavigationFixture(desktopApp);
  await desktopApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1200, 720);
  });
  await page.reload();
  await page.getByRole('button', { name: 'Clips', exact: true }).click();
  await page
    .locator('.clips-preview-heading')
    .getByRole('button', { name: 'Edit clip', exact: true })
    .click();
  await expect(page.locator('.clip-packaging')).toBeVisible();
  await navigationControl(desktopApp, { hold: true });
  const packaging = page.getByRole('navigation').getByRole('button', { name: 'Packaging', exact: true });
  await packaging.click();
  await expectPending(packaging);
  await navigationControl(desktopApp, { refresh: true });
  await navigationControl(desktopApp, { release: 'failure' });
  await expect(packaging.locator('svg.spin')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(
    page.locator('.clip-packaging').getByRole('textbox', { name: 'Titles', exact: true }),
  ).toHaveValue('Clip short title');
  await packaging.click();
  await expectPending(packaging);
  await navigationControl(desktopApp, { release: 'success' });
  await expect(page.locator('.clip-workspace')).toHaveCount(0);
  await expect(packaging).toHaveAttribute('aria-current', 'page');
  await expect(packaging).toHaveAttribute('aria-busy', 'false');
});

test('cancelled commit dialog keeps the real busy header visible at minimum width until helper cleanup', async ({
  desktopApp,
  page,
  rendererUrl,
}) => {
  await installStartupFixture(desktopApp, rendererUrl, false, false);
  await desktopApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1200, 720);
  });
  await page.reload();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Keep this draft');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a version', exact: true });
  await expect(dialog.locator('.commit-generation svg.spin')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.status')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.status')).toBeVisible();
  await expect(page.locator('.status')).toHaveText('Working…');
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeDisabled();
  await startupControl(desktopApp, { release: 'suggestCommit' });
  await expect(page.locator('.status')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.status')).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Keep this draft');
});
