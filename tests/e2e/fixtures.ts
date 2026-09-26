import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron, test as base, expect, type ElectronApplication, type Page } from '@playwright/test';

interface DesktopFixtures {
  desktopApp: ElectronApplication;
  page: Page;
  userData: string;
  rendererUrl: string;
}

export const test = base.extend<DesktopFixtures>({
  rendererUrl: ['', { option: true }],
  userData: async ({ baseURL }, use) => {
    if (baseURL)
      throw new Error('Desktop tests start their own renderer; do not configure a browser baseURL.');
    const directory = await mkdtemp(join(tmpdir(), 'vandashi-e2e-'));
    try {
      await use(directory);
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  },
  desktopApp: async ({ userData, rendererUrl }, use, testInfo) => {
    const environment: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env))
      if (typeof value === 'string' && key !== 'ELECTRON_RUN_AS_NODE') environment[key] = value;
    environment.VANDASHI_USER_DATA = userData;
    environment.ELECTRON_RENDERER_URL = rendererUrl;
    const application = await _electron.launch({
      args: [join(process.cwd(), 'tests/e2e/bootstrap.mjs'), join(process.cwd(), 'out/main/index.js')],
      chromiumSandbox: true,
      env: environment,
      timeout: 30_000,
    });
    const child = application.process();
    let diagnostics = '';
    const capture = (chunk: Buffer) => {
      diagnostics = (diagnostics + chunk.toString()).slice(-64 * 1024);
    };
    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);
    let setupComplete = false;
    try {
      // Tests deliberately reload or dispose transient editor state; close-guard tests override this choice.
      await application.evaluate(({ dialog }) => {
        dialog.showMessageBoxSync = () => 1;
      });
      setupComplete = true;
      await use(application);
    } finally {
      if ((!setupComplete || testInfo.status !== testInfo.expectedStatus) && diagnostics) {
        await testInfo.attach('electron-process.log', { body: diagnostics, contentType: 'text/plain' });
        console.error(diagnostics);
      }
      if (child.exitCode === null) await application.close();
    }
  },
  page: async ({ desktopApp }, use) => {
    const page = await desktopApp.firstWindow();
    const uncaught: string[] = [];
    page.on('pageerror', (error) => {
      uncaught.push(error.message);
    });
    page.on('dialog', () => undefined); // Native Electron owns beforeunload confirmation.
    // A fixture reload must not abort main's still-pending initial window.loadURL and quit the app.
    await page.waitForLoadState('load');
    await use(page);
    expect(uncaught, 'The desktop renderer must not raise uncaught JavaScript errors.').toEqual([]);
  },
});

export { expect };
