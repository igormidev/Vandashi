import { spawn } from 'node:child_process';
import type * as ChildProcessModule from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AgentError } from '../src/domain/agent';
import { diagnosticFromError } from '../src/domain/diagnostics';
import { EventReducer } from '../src/infrastructure/codex/events';
import { CodexTransport, JsonLineDecoder, RpcError } from '../src/infrastructure/codex/transport';

// Observe the real owned process and retain its native pipes and exit diagnostics.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcessModule>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

function ownedChild() {
  const result = vi.mocked(spawn).mock.results.at(-1);
  const child = result?.type === 'return' ? result.value : undefined;
  if (!child?.stdin) throw new Error('Expected a real process with piped stdin');
  return { child, stdin: child.stdin };
}

function ready(transport: CodexTransport): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = transport.subscribe((event) => {
      if (event.method !== 'fixture/ready') return;
      unsubscribe();
      resolve();
    });
  });
}

function breakInput(stdin: NonNullable<ReturnType<typeof spawn>['stdin']>): Promise<unknown[]> {
  const failed = once(stdin, 'error');
  // close(0) does not break Node's overlapped stdin pipe on Windows. Inject the stream
  // failure on the real parent pipe, leaving child lifetime and stderr entirely native.
  stdin.destroy(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
  return failed;
}

describe('Codex diagnostic provenance', () => {
  it('keeps operational codes while distinguishing app descriptors from identically spelled external prose', () => {
    const owned = new AgentError('timeout', { id: 'codexRequestTimeout', params: { method: 'model/list' } });
    expect(owned.code).toBe('timeout');
    expect(owned.message).toBe('Codex did not respond to model/list.');
    expect(diagnosticFromError(owned)).toEqual({
      kind: 'app',
      message: { id: 'codexRequestTimeout', params: { method: 'model/list' } },
    });
    for (const external of [new AgentError('timeout', owned.message), new RpcError(-32602, owned.message)])
      expect(diagnosticFromError(external)).toEqual({ kind: 'external', text: owned.message });
  });

  it('marks its protocol size guard as app-owned', () => {
    expect(() => new JsonLineDecoder(3).push('abcd')).toThrow(
      expect.objectContaining({
        code: 'protocol',
        diagnostic: { kind: 'app', message: { id: 'codexMessageTooLarge' } },
      }),
    );
  });

  it('distinguishes its withheld request notice from a provider warning with identical wording', () => {
    const reducer = new EventReducer();
    const withheld = reducer.reduce({
      method: 'vandashi/request-declined',
      params: { method: 'requestApproval' },
    });
    expect(withheld).toMatchObject({
      type: 'warning',
      diagnostic: {
        kind: 'app',
        message: { id: 'codexRequestWithheld', params: { method: 'requestApproval' } },
      },
    });
    if (withheld?.type !== 'warning') throw new Error('Expected a warning fixture');
    expect(reducer.reduce({ method: 'warning', params: { message: withheld.detail } })).toEqual({
      type: 'warning',
      detail: withheld.detail,
    });
  });

  it('keeps actual process stderr verbatim as external detail inside the exit diagnostic', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vandashi-codex-diagnostic-'));
    const stderr = '模型 unavailable\nVANDASHI_DIAGNOSTIC_V1:provider text\n';
    const binary = join(root, 'fixture.mjs');
    await writeFile(
      binary,
      `#!/usr/bin/env node\nprocess.stderr.write(${JSON.stringify(stderr)}); process.exit(23);\n`,
    );
    const transport = new CodexTransport(binary, 2_000);
    try {
      await expect(transport.initialize()).rejects.toMatchObject({
        code: 'unavailable',
        diagnostic: {
          kind: 'app',
          message: { id: 'codexExited', params: { code: '23' } },
          externalDetail: stderr,
        },
      });
    } finally {
      await transport.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('drains a stdin stream failure before reporting the real later stderr and exit code', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vandashi-codex-pipe-diagnostic-'));
    const gate = join(root, 'release');
    const stderr = '模型 unavailable\nVANDASHI_DIAGNOSTIC_V1:late provider detail\n';
    const binary = join(root, 'fixture.mjs');
    await writeFile(
      binary,
      `#!/usr/bin/env node
import { existsSync } from 'node:fs';
process.stdout.write(JSON.stringify({method:'fixture/ready'})+'\\n');
const timer = setInterval(() => {
  if (!existsSync(${JSON.stringify(gate)})) return;
  clearInterval(timer);
  process.stderr.write(${JSON.stringify(stderr)}, () => process.exit(23));
}, 5);
`,
    );
    const transport = new CodexTransport(binary, 2_000);
    const { child, stdin } = ownedChild();
    const failures: Error[] = [];
    transport.onFailure((error) => failures.push(error));
    try {
      await ready(transport);
      let settled = false;
      const response = transport.initialize().catch((error: unknown) => {
        settled = true;
        return error;
      });
      const errors = await breakInput(stdin);
      expect(errors[0]).toMatchObject({ code: 'EPIPE' });
      expect(child.exitCode).toBeNull();
      expect(settled).toBe(false);
      expect(failures).toHaveLength(0);
      await expect(transport.request('model/list', {})).rejects.toMatchObject({ code: 'unavailable' });
      const closed = transport.close();
      expect(transport.close()).toBe(closed);
      await writeFile(gate, 'release');
      expect(await response).toMatchObject({
        code: 'unavailable',
        diagnostic: {
          kind: 'app',
          message: { id: 'codexExited', params: { code: '23' } },
          externalDetail: stderr,
        },
      });
      await closed;
      expect(child.exitCode).toBe(23);
      expect(failures).toHaveLength(1);
    } finally {
      await transport.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('waits for final stderr after the process exit event and before stdio close', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vandashi-codex-exit-diagnostic-'));
    const stderr = 'Final provider stderr buffered until process exit\n';
    const binary = join(root, 'fixture.mjs');
    await writeFile(
      binary,
      `#!/usr/bin/env node
process.stderr.write(${JSON.stringify(stderr)}, () => process.exit(23));
`,
    );
    const transport = new CodexTransport(binary, 2_000);
    const { child } = ownedChild();
    if (!child.stderr) throw new Error('Expected a real process with piped stderr');
    // Delay delivery of real pipe bytes. Node flushes paused stdio after exit; no
    // descendant inheriting a POSIX descriptor is needed to enforce this ordering.
    child.stderr.pause();
    let receivedStderr = false;
    child.stderr.on('data', () => {
      receivedStderr = true;
    });
    let settled = false;
    let observedExit: { settled: boolean; receivedStderr: boolean } | undefined;
    child.once('exit', () => {
      observedExit = { settled, receivedStderr };
    });
    const exited = once(child, 'exit');
    try {
      const response = transport.initialize().catch((error: unknown) => {
        settled = true;
        return error;
      });
      expect((await exited)[0]).toBe(23);
      expect(observedExit).toEqual({ settled: false, receivedStderr: false });
      child.stderr.resume();
      expect(await response).toMatchObject({
        code: 'unavailable',
        diagnostic: {
          kind: 'app',
          message: { id: 'codexExited', params: { code: '23' } },
          externalDetail: stderr,
        },
      });
    } finally {
      await transport.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('owns bounded teardown when a broken-input process stays alive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vandashi-codex-stalled-diagnostic-'));
    const binary = join(root, 'fixture.mjs');
    const stderr = 'Provider stopped reading input but stayed alive\n';
    await writeFile(
      binary,
      `#!/usr/bin/env node
process.stderr.write(${JSON.stringify(stderr)});
process.stdout.write(JSON.stringify({method:'fixture/ready'})+'\\n');
setInterval(() => {}, 1000);
`,
    );
    const transport = new CodexTransport(binary, 2_000);
    const { child, stdin } = ownedChild();
    try {
      await ready(transport);
      const response = transport.initialize().catch((error: unknown) => error);
      expect((await breakInput(stdin))[0]).toMatchObject({ code: 'EPIPE' });
      expect(child.exitCode).toBeNull();
      expect(await response).toMatchObject({
        code: 'unavailable',
        diagnostic: { kind: 'app', message: { id: 'codexExited' }, externalDetail: stderr },
      });
      await transport.close();
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    } finally {
      await transport.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
