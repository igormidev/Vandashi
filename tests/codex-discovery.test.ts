import { describe, expect, it, vi } from 'vitest';
import { loadCapabilities, status } from '../src/infrastructure/codex/discovery';
import type { RpcClient } from '../src/infrastructure/codex/transport';

function clientFor(pages: unknown[], skills: unknown[] = []) {
  return {
    request: vi.fn((method: string) => {
      if (method === 'skills/list') return Promise.resolve({ data: [{ cwd: '/brand', skills, errors: [] }] });
      if (method === 'plugin/installed') return Promise.resolve({ marketplaces: [] });
      if (method === 'mcpServerStatus/list') return Promise.resolve(pages.shift() ?? {});
      throw new Error(`Unexpected ${method}`);
    }),
    subscribe: () => () => undefined,
    onFailure: () => () => undefined,
    close: () => Promise.resolve(),
  } satisfies RpcClient;
}

it.each([null, undefined, 'true', 'failure'])(
  'keeps ChatGPT usage unavailable when discovery returns %s',
  async (ordinaryUsageAllowed) => {
    const client = clientFor([]);
    client.request.mockImplementation((method) => {
      if (method === 'account/read')
        return Promise.resolve({ account: { type: 'chatgpt' }, requiresOpenaiAuth: true });
      if (ordinaryUsageAllowed === 'failure') return Promise.reject(new Error('Usage service unavailable'));
      return Promise.resolve({ ordinaryUsageAllowed, rateLimits: { primary: { usedPercent: 0 } } });
    });
    expect(await status(client, 'test')).toMatchObject({
      authenticated: true,
      accountType: 'chatgpt',
      usageAllowed: null,
    });
  },
);

it('uses a fresh explicit permission on each usage retry', async () => {
  const client = clientFor([]);
  const permissions = [false, null, true];
  client.request.mockImplementation((method) =>
    Promise.resolve(
      method === 'account/read'
        ? { account: { type: 'chatgpt' }, requiresOpenaiAuth: true }
        : { ordinaryUsageAllowed: permissions.shift() },
    ),
  );
  expect((await status(client, 'test')).usageAllowed).toBe(false);
  expect((await status(client, 'test')).usageAllowed).toBeNull();
  expect((await status(client, 'test')).usageAllowed).toBe(true);
});

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

it('accepts only explicitly enabled, valid live skills and forces fresh discovery', async () => {
  const core = {
    name: 'hyperframes',
    path: '/skills/hyperframes/SKILL.md',
    description: 'Core',
    enabled: true,
  };
  const client = clientFor(
    [],
    [
      core,
      { ...core, enabled: false },
      { ...core, enabled: undefined },
      { ...core, enabled: 'true' },
      { ...core, name: '' },
      { ...core, path: '' },
      { ...core, description: undefined },
      { ...core, name: 'hyperframes-audio', path: '/skills/hyperframes-audio/SKILL.md' },
    ],
  );
  const capabilities = await loadCapabilities(client, '/brand');
  expect(capabilities.skills.map((skill) => skill.name)).toEqual(['hyperframes', 'hyperframes-audio']);
  expect(client.request).toHaveBeenCalledWith('skills/list', { cwds: ['/brand'], forceReload: true });
});
