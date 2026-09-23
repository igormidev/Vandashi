import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentError, type AgentRunInput } from '../src/domain/agent';
import { executeTurn } from '../src/infrastructure/codex/execution';
import { CodexTransport, RpcError, type RpcClient } from '../src/infrastructure/codex/transport';

const input: AgentRunInput = {
  threadId: 'startup-thread',
  cwd: '/workspace',
  writableRoots: ['/workspace'],
  mode: 'edit',
  selection: { model: 'test', reasoning: 'medium', fast: false },
  prompt: 'Edit',
  attachments: [],
};
const callbacks = { onEvent: () => undefined, onTurn: () => undefined, supportsImages: false };
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function client(start: () => Promise<unknown>, close: () => Promise<void>): RpcClient {
  return { request: start, close, subscribe: () => () => undefined, onFailure: () => () => undefined };
}

describe('uncertain Codex startup', () => {
  it('does not settle until shutdown confirms termination after a missing start acknowledgement', async () => {
    let stopped: () => void = () => undefined;
    const shutdown = new Promise<void>((resolve) => {
      stopped = resolve;
    });
    const close = vi.fn(() => shutdown);
    let settled = false;
    const result = executeTurn(
      client(() => Promise.reject(new AgentError('timeout', 'Lost ACK')), close),
      'startup-thread',
      input,
      callbacks,
    ).catch((error: unknown) => {
      settled = true;
      return error;
    });
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledOnce();
    });
    expect(settled).toBe(false);
    stopped();
    expect(await result).toMatchObject({ code: 'uncertain-start' });
  });

  it('treats a malformed acknowledgement as uncertain and preserves explicit rejection semantics', async () => {
    const close = vi.fn(() => Promise.resolve());
    await expect(
      executeTurn(
        client(() => Promise.resolve({ malformed: true }), close),
        'startup-thread',
        input,
        callbacks,
      ),
    ).rejects.toMatchObject({ code: 'uncertain-start' });
    expect(close).toHaveBeenCalledOnce();
    close.mockClear();
    await expect(
      executeTurn(
        client(() => Promise.reject(new RpcError(-32602, 'Invalid model')), close),
        'startup-thread',
        input,
        callbacks,
      ),
    ).rejects.toThrow('Invalid model');
    expect(close).not.toHaveBeenCalled();
    await expect(
      executeTurn(
        client(() => Promise.reject(new RpcError(-32603, 'Internal server error')), close),
        'startup-thread',
        input,
        callbacks,
      ),
    ).rejects.toMatchObject({ code: 'uncertain-start' });
    expect(close).toHaveBeenCalledOnce();
  });

  it.skipIf(process.platform === 'win32')(
    'waits for a real delayed server shutdown and stops its writing child',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'vandashi-codex-startup-'));
      directories.push(root);
      const writes = join(root, 'writes.txt');
      const ended = join(root, 'server-stopped.txt');
      const binary = join(root, 'codex-fixture.mjs');
      const child = `import { appendFileSync } from 'node:fs'; setInterval(() => appendFileSync(${JSON.stringify(writes)}, 'x'), 10);`;
      await writeFile(
        binary,
        `#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const lines = createInterface({ input: process.stdin });
setInterval(() => {}, 1000);
process.on('SIGTERM', () => setTimeout(() => { writeFileSync(${JSON.stringify(ended)}, 'stopped'); process.exit(0); }, 150));
lines.on('line', line => {
  const request = JSON.parse(line);
  if (request.method === 'initialize') process.stdout.write(JSON.stringify({id:request.id,result:{userAgent:'fixture'}})+'\\n');
  if (request.method === 'turn/start') spawn(process.execPath, ['--input-type=module', '--eval', ${JSON.stringify(child)}], {stdio:'ignore'});
});
`,
        { mode: 0o755 },
      );
      const transport = new CodexTransport(binary, 1_000);
      try {
        await transport.initialize();
        await expect(executeTurn(transport, 'startup-thread', input, callbacks)).rejects.toMatchObject({
          code: 'uncertain-start',
        });
        expect(await readFile(ended, 'utf8')).toBe('stopped');
        const before = await readFile(writes, 'utf8');
        expect(before.length).toBeGreaterThan(0);
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(await readFile(writes, 'utf8')).toBe(before);
        await expect(transport.request('turn/start', {})).rejects.toMatchObject({ code: 'unavailable' });
      } finally {
        await transport.close();
      }
    },
  );
});
