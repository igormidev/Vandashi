import { createServer, type ServerResponse } from 'node:http';
import { test as desktopTest, expect } from './fixtures';

interface StartupServer {
  url: string;
  imageRequests: number;
  release: () => void;
}

const test = desktopTest.extend<{ startupServer: StartupServer }>({
  startupServer: async ({ userData }, use) => {
    const pending = new Set<ServerResponse>();
    const state: StartupServer = {
      url: '',
      imageRequests: 0,
      release: () => {
        for (const response of pending) {
          response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
          response.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
        }
        pending.clear();
      },
    };
    const server = createServer((request, response) => {
      if (request.url === '/initial-load.svg') {
        state.imageRequests += 1;
        pending.add(response);
        response.once('close', () => pending.delete(response));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><title>Renderer startup</title><img src="/initial-load.svg">');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error(`Missing startup server for ${userData}`);
    state.url = `http://127.0.0.1:${String(address.port)}/`;
    try {
      await use(state);
    } finally {
      state.release();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  },
  rendererUrl: async ({ startupServer }, use) => {
    await use(startupServer.url);
  },
});

test('a native Reload during initial loading keeps the actual app alive until the replacement finishes', async ({
  desktopApp,
  startupServer,
}) => {
  const child = desktopApp.process();
  const errors: string[] = [];
  child.stderr?.on('data', (chunk: Buffer) => {
    errors.push(chunk.toString('utf8'));
  });
  const page = await desktopApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await expect.poll(() => startupServer.imageRequests).toBe(1);
  expect(await page.evaluate(() => document.readyState)).toBe('interactive');
  await desktopApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('Missing startup window');
    // This is the same native action used by Electron's default View > Reload menu.
    window.webContents.reload();
  });
  await expect.poll(() => startupServer.imageRequests === 2 || child.exitCode !== null).toBe(true);
  expect(child.exitCode, errors.join('')).toBeNull();
  expect(startupServer.imageRequests).toBe(2);
  startupServer.release();
  await page.waitForLoadState('load');
  expect(page.url()).toBe(startupServer.url);
  expect(child.exitCode).toBeNull();
  expect(await desktopApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});
