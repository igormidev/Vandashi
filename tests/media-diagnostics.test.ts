import { expect, it } from 'vitest';
import { diagnosticFromError } from '../src/domain/diagnostics';
import { parseMediaProbe, requiredDoctorChecks } from '../src/infrastructure/media/diagnostics';
import { runProcess } from '../src/infrastructure/media/runtime';
import { parseStudioReady } from '../src/infrastructure/media/studio-process';

it('preserves provider text even when it exactly resembles an app message', async () => {
  const error: unknown = await runProcess(
    process.execPath,
    ['-e', "process.stderr.write('The media command timed out.');process.exit(2)"],
    process.env,
  ).catch((failure: unknown) => failure);
  expect(diagnosticFromError(error)).toEqual({ kind: 'external', text: 'The media command timed out.' });
  const empty: unknown = await runProcess(process.execPath, ['-e', 'process.exit(2)'], process.env).catch(
    (failure: unknown) => failure,
  );
  expect(diagnosticFromError(empty)).toEqual({
    kind: 'app',
    message: { id: 'mediaCommandExited', params: { code: '2' } },
  });
});

it('uses app descriptors for probe and project guards without classifying unrelated provider details', () => {
  try {
    parseMediaProbe(JSON.stringify({ streams: [], format: { duration: '-1' } }));
    throw new Error('Expected invalid duration');
  } catch (error) {
    expect(diagnosticFromError(error)).toEqual({ kind: 'app', message: { id: 'mediaDurationInvalid' } });
  }
  try {
    parseStudioReady(
      JSON.stringify({
        schemaVersion: 1,
        operation: 'start',
        ok: true,
        result: {
          projectName: 'different',
          projectDir: '/tmp/different',
          host: '127.0.0.1',
          port: 3456,
          ready: true,
        },
      }),
      '/tmp/expected',
    );
    throw new Error('Expected project guard');
  } catch (error) {
    expect(diagnosticFromError(error)).toEqual({
      kind: 'app',
      message: { id: 'mediaStudioDifferentProject' },
    });
  }
  const checks = requiredDoctorChecks(
    JSON.stringify({ checks: [{ name: 'Node.js', ok: true, detail: 'Raw provider detail Ω' }] }),
  );
  expect(checks[0]?.detail).toBe('Raw provider detail Ω');
  expect(checks[0]?.diagnostic).toBeUndefined();
  expect(checks[1]?.diagnostic).toEqual({
    kind: 'app',
    message: { id: 'mediaCheckUnavailable', params: { name: 'FFmpeg' } },
  });
});
