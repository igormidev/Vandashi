import type { Page } from '@playwright/test';
import { appMessageCatalogs } from '../../src/domain/messages/catalogs';
import { interfaceCatalogs } from '../../src/renderer/locales/catalogs';
import { test, expect } from './development-fixtures';
import {
  installStartupFixture,
  proveDevelopment,
  startupCalls,
  startupControl,
} from './startup-development-fixture';

async function changeLanguage(page: Page, from: 'en' | 'ja', to: 'en' | 'ja') {
  const text = interfaceCatalogs[from];
  await page.getByRole('button', { name: text.settings, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: text.settings, exact: true });
  await dialog.getByRole('combobox', { name: text.language, exact: true }).selectOption(to);
  await dialog.getByRole('button', { name: text.save, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('lang', to);
}

for (const consumer of ['main-preview', 'manual-studio', 'clip-preview'] as const) {
  test(`development ${consumer} retranslates persistent startup failures without starting Studio again`, async ({
    desktopApp,
    page,
    rendererUrl,
  }) => {
    await installStartupFixture(desktopApp, rendererUrl);
    await page.route('**/studio-test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Studio fixture</title>' }),
    );
    await page.reload();
    await proveDevelopment(page);
    if (consumer === 'clip-preview') {
      await page.getByRole('button', { name: 'Clips', exact: true }).click();
      await page.getByRole('button', { name: 'Edit clip', exact: true }).last().click();
    } else {
      await page
        .getByRole('button', {
          name: consumer === 'main-preview' ? 'Creation workspace' : 'Manual editing',
          exact: true,
        })
        .click();
    }
    const starts = async () =>
      (await startupCalls(desktopApp)).filter(({ method }) => method === 'startStudio');
    await expect.poll(async () => (await starts()).length).toBe(1);

    const raw = 'ENOENT: /tmp/制作 & clips/start.js\nprovider output: "keep this text"';
    await startupControl(desktopApp, {
      release: 'startStudio',
      diagnostic: {
        kind: 'app',
        message: { id: 'mediaStudioExited', params: { code: 17 } },
        externalDetail: raw,
      },
    });
    const empty = page.locator(
      consumer === 'manual-studio'
        ? '.app-body > .empty'
        : consumer === 'clip-preview'
          ? '.clip-editor-preview .preview-stage .empty'
          : '.preview-stage .empty',
    );
    const detail = empty.locator(':scope > p');
    const expected = (locale: 'en' | 'ja') =>
      `${appMessageCatalogs[locale].mediaStudioExited.replace('{{code}}', '17')}\n${raw}`;
    await expect.poll(() => detail.textContent()).toBe(expected('en'));
    await changeLanguage(page, 'en', 'ja');
    await expect.poll(() => detail.textContent()).toBe(expected('ja'));
    await expect(empty.getByRole('button', { name: interfaceCatalogs.ja.retry, exact: true })).toBeVisible();
    expect(await starts()).toHaveLength(1);

    await changeLanguage(page, 'ja', 'en');
    await expect.poll(() => detail.textContent()).toBe(expected('en'));
    expect(await starts()).toHaveLength(1);

    // An explicit retry starts once; provider prose keeps its original spelling in either locale.
    await empty.getByRole('button', { name: interfaceCatalogs.en.retry, exact: true }).click();
    await expect.poll(async () => (await starts()).length).toBe(2);
    const external = `${appMessageCatalogs.en.mediaStudioStartFailed}\n${raw}`;
    await startupControl(desktopApp, {
      release: 'startStudio',
      diagnostic: { kind: 'external', text: external },
    });
    await expect.poll(() => detail.textContent()).toBe(external);
    await changeLanguage(page, 'en', 'ja');
    await expect.poll(() => detail.textContent()).toBe(external);
    expect(await starts()).toHaveLength(2);

    await empty.getByRole('button', { name: interfaceCatalogs.ja.retry, exact: true }).click();
    await expect.poll(async () => (await starts()).length).toBe(3);
    await startupControl(desktopApp, { release: 'startStudio' });
    await expect(
      page.locator(consumer === 'manual-studio' ? '.studio-frame' : 'hyperframes-player'),
    ).toHaveAttribute('src', /studio-test\//);
    await expect(empty).toBeHidden();
    expect(await starts()).toHaveLength(3);
  });
}
