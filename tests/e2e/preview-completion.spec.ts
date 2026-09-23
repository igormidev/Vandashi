import { test, expect } from './development-fixtures';
import {
  installStartupFixture,
  startupCalls,
  startupControl,
  proveDevelopment,
} from './startup-development-fixture';

for (const consumer of ['creation', 'clip'] as const) {
  for (const supersededFailure of [false, true]) {
    test(`${consumer} preview waits for its ${supersededFailure ? 'failed and superseded' : 'pending'} startup before adopting a completion snapshot`, async ({
      desktopApp,
      page,
      rendererUrl,
    }) => {
      await installStartupFixture(desktopApp, rendererUrl);
      await page.route('**/studio-test/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Preview fixture</title>' }),
      );
      await page.reload();
      await proveDevelopment(page);
      if (consumer === 'clip') {
        await page.getByRole('button', { name: 'Clips', exact: true }).click();
        await page.getByRole('button', { name: 'Edit clip', exact: true }).last().click();
      } else await page.getByRole('button', { name: 'Creation workspace', exact: true }).click();
      const starts = async () =>
        (await startupCalls(desktopApp)).filter(({ method }) => method === 'startStudio');
      await expect.poll(async () => (await starts()).length).toBe(1);
      const reads = (await startupCalls(desktopApp)).filter(
        ({ method }) => method === 'openWorkspace',
      ).length;
      await startupControl(desktopApp, { refresh: true });
      await expect
        .poll(
          async () =>
            (await startupCalls(desktopApp)).filter(({ method }) => method === 'openWorkspace').length,
        )
        .toBe(reads + 1);
      if (supersededFailure) {
        await startupControl(desktopApp, { refresh: true });
        await expect
          .poll(
            async () =>
              (await startupCalls(desktopApp)).filter(({ method }) => method === 'openWorkspace').length,
          )
          .toBe(reads + 2);
      }
      await expect(page.locator('.preview-stage')).toContainText('Opening Hyperframes Studio…');
      expect(await starts()).toHaveLength(1);
      await startupControl(desktopApp, { release: 'startStudio', fail: supersededFailure });
      await expect.poll(async () => (await starts()).length).toBe(2);
      await expect(page.locator('hyperframes-player')).toHaveCount(0);
      await startupControl(desktopApp, { release: 'startStudio' });
      await expect(page.locator('hyperframes-player')).toHaveAttribute(
        'src',
        supersededFailure ? /\?v=one-refreshed-refreshed$/ : /\?v=one-refreshed$/,
      );
      await expect(page.locator('.toast')).toHaveCount(0);
      expect(await starts()).toHaveLength(2);
    });
  }
}
