import { describe, expect, it, vi } from 'vitest';
import { loadCapabilities } from '../src/infrastructure/codex/discovery';
import type { RpcClient } from '../src/infrastructure/codex/transport';

function clientFor(pages: unknown[]) {
  return {
    request: vi.fn((method: string) => {
      if (method === 'skills/list') return Promise.resolve({ data: [] });
      if (method === 'plugin/installed') return Promise.resolve({ marketplaces: [] });
      if (method === 'mcpServerStatus/list') return Promise.resolve(pages.shift() ?? {});
      throw new Error(`Unexpected ${method}`);
    }),
    subscribe: () => () => undefined,
    onFailure: () => () => undefined,
    close: () => undefined,
  } satisfies RpcClient;
}

describe('actual browser capability discovery', () => {
  it('follows pages and requires usable computer control or the complete browser tool family', async () => {
    const client = clientFor([
      {
        data: [
          { name: 'browser_docs', tools: { search: {} } },
          { name: 'partial', tools: { browser_navigate: {} } },
        ],
        nextCursor: 'next',
      },
      {
        data: [
          { name: 'cua_repl', tools: { js: {}, js_reset: {} } },
          {
            name: 'playwright',
            tools: { browser_navigate: {}, browser_snapshot: {}, browser_file_upload: {} },
          },
        ],
        nextCursor: null,
      },
    ]);
    expect((await loadCapabilities(client, '/brand')).browserTools).toEqual([
      'cua_repl.js',
      'cua_repl.js_reset',
      'playwright.browser_navigate',
      'playwright.browser_snapshot',
      'playwright.browser_file_upload',
    ]);
    expect(client.request).toHaveBeenCalledWith('mcpServerStatus/list', {
      cursor: 'next',
      limit: 100,
      detail: 'toolsAndAuthOnly',
    });
  });
  it('does not advertise failed or errored connector catalogs', async () => {
    const client = clientFor([
      {
        data: [
          { name: 'cua_repl', tools: { js: {} }, runtimeStatus: 'failed' },
          { name: 'cua_repl', tools: { js: {} }, toolsError: 'Disconnected' },
        ],
        nextCursor: null,
      },
    ]);
    expect((await loadCapabilities(client, '/brand')).browserTools).toEqual([]);
  });
  it('bounds repeated cursors and returns unavailable on incomplete discovery', async () => {
    const page = { data: [{ name: 'cua_repl', tools: { js: {} } }], nextCursor: 'again' };
    const client = clientFor([page, page]);
    expect((await loadCapabilities(client, '/brand')).browserTools).toEqual([]);
  });
});
