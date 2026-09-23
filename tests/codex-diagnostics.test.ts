import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentError } from '../src/domain/agent';
import { diagnosticFromError } from '../src/domain/diagnostics';
import { EventReducer } from '../src/infrastructure/codex/events';
import { CodexTransport, JsonLineDecoder, RpcError } from '../src/infrastructure/codex/transport';

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
});
