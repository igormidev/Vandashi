import { afterEach, expect, it, vi } from 'vitest';
import type { DependencyCheck } from '../src/domain/models';
import { appMessageEnglish } from '../src/domain/messages';
import { checkMediaDependencies, requiredDoctorChecks } from '../src/infrastructure/media/diagnostics';
import * as processes from '../src/infrastructure/media/runtime';

const runtime: processes.MediaRuntime = {
  nodePath: 'fixture-node',
  cliPath: 'fixture-cli',
  environment: {},
  startupTimeoutMs: 1000,
  skillRoots: [],
};
afterEach(() => vi.restoreAllMocks());

it('carries readable typed labels in every emitted and returned media check', async () => {
  vi.spyOn(processes, 'runProcess')
    .mockResolvedValueOnce('0.8.64')
    .mockResolvedValueOnce(
      JSON.stringify({
        checks: ['Node.js', 'FFmpeg', 'FFprobe', 'Chrome'].map((name) => ({
          name,
          ok: true,
          detail: `Vendor detail: ${name}`,
        })),
      }),
    );
  const progress: DependencyCheck[] = [];
  const checks = await checkMediaDependencies(runtime, (check) => progress.push(check));
  expect(progress).toEqual(checks);
  expect(checks.map((check) => (check.label ? appMessageEnglish(check.label) : null))).toEqual([
    'Hyperframes',
    'Node.js',
    'FFmpeg',
    'FFprobe',
    'Chrome',
    'Hyperframes skill',
  ]);
  expect(checks.find((check) => check.id === 'media-nodejs')).toMatchObject({
    detail: 'Vendor detail: Node.js',
    label: { id: 'mediaNodeLabel' },
  });
});

it('keeps display labels when doctor cannot verify a dependency', () => {
  const checks = requiredDoctorChecks('{"checks":[]}');
  expect(checks.map((check) => check.status)).toEqual(Array<string>(4).fill('missing'));
  expect(checks.map((check) => (check.label ? appMessageEnglish(check.label) : null))).toEqual([
    'Node.js',
    'FFmpeg',
    'FFprobe',
    'Chrome',
  ]);
});

it.each([
  { versionKnown: false, id: 'hyperframes', label: 'mediaHyperframesLabel' },
  { versionKnown: true, id: 'media-environment', label: 'mediaEnvironmentLabel' },
])('retains $id display provenance after a process failure', async ({ versionKnown, id, label }) => {
  const process = vi.spyOn(processes, 'runProcess');
  if (versionKnown) process.mockResolvedValueOnce('0.8.64');
  process.mockRejectedValueOnce(new Error('Raw vendor failure Ω'));
  const progress: DependencyCheck[] = [];
  const checks = await checkMediaDependencies(runtime, (check) => progress.push(check));
  const failed = checks.find((check) => check.id === id);
  expect(failed).toMatchObject({
    status: 'error',
    label: { id: label },
    diagnostic: { kind: 'external', text: 'Raw vendor failure Ω' },
  });
  expect(progress.find((check) => check.id === id)).toEqual(failed);
});
