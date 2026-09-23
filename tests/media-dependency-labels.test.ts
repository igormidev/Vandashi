import { afterEach, expect, it, vi } from 'vitest';
import type { DependencyCheck } from '../src/domain/models';
import { appMessageEnglish } from '../src/domain/messages';
import { checkMediaDependencies, requiredDoctorChecks } from '../src/infrastructure/media/diagnostics';
import * as processes from '../src/infrastructure/media/runtime';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AppFault } from '../src/domain/diagnostics';

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
  expect(checks.find((check) => check.id === 'skill')?.repairPrompt).toBeNull();
});

it('does not treat a skill file as proof of a valid enabled Codex skill or offer an impossible global repair', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-skill-presence-'));
  try {
    await mkdir(join(root, 'hyperframes'));
    await writeFile(join(root, 'hyperframes', 'SKILL.md'), 'Malformed skill without metadata');
    vi.spyOn(processes, 'runProcess').mockResolvedValueOnce('0.8.64').mockResolvedValueOnce('{"checks":[]}');
    const checks = await checkMediaDependencies({ ...runtime, skillRoots: [root] });
    expect(checks.find((check) => check.id === 'skill')).toMatchObject({
      status: 'missing',
      repairPrompt: null,
      helpUrl: 'https://hyperframes.heygen.com/guides/skills',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
  {
    versionKnown: false,
    id: 'hyperframes',
    label: 'mediaHyperframesLabel',
    message: 'mediaBundledRuntimeRecovery',
    helpUrl: 'https://github.com/igormidev/Vandashi#run-from-source',
  },
  {
    versionKnown: true,
    id: 'media-environment',
    label: 'mediaEnvironmentLabel',
    message: 'mediaEnvironmentRecovery',
    helpUrl: 'https://hyperframes.heygen.com/guides/troubleshooting',
  },
])(
  'retains $id display provenance after a process failure',
  async ({ versionKnown, id, label, message, helpUrl }) => {
    const process = vi.spyOn(processes, 'runProcess');
    if (versionKnown) process.mockResolvedValueOnce('0.8.64');
    process.mockRejectedValueOnce(new Error('Raw vendor failure Ω'));
    const progress: DependencyCheck[] = [];
    const checks = await checkMediaDependencies(runtime, (check) => progress.push(check));
    const failed = checks.find((check) => check.id === id);
    expect(failed).toMatchObject({
      status: 'error',
      label: { id: label },
      repairPrompt: null,
      helpUrl,
      diagnostic: { kind: 'external', text: 'Raw vendor failure Ω' },
      recovery: { id: message },
    });
    expect(progress.find((check) => check.id === id)).toEqual(failed);
  },
);

it.each([
  new AppFault({ id: 'mediaCommandTimedOut' }),
  new AppFault({ id: 'mediaCommandOutputLimit' }),
  new AppFault({ id: 'mediaCommandExited', params: { code: '7' } }, 'Raw process detail Ω'),
])('retains the process cause and parameters alongside environment recovery (%#)', async (error) => {
  vi.spyOn(processes, 'runProcess').mockResolvedValueOnce('0.8.64').mockRejectedValueOnce(error);
  const progress: DependencyCheck[] = [];
  const checks = await checkMediaDependencies(runtime, (check) => progress.push(check));
  const failure = checks.find((check) => check.id === 'media-environment');
  expect(failure).toMatchObject({
    status: 'error',
    detail: error.message,
    diagnostic: error.diagnostic,
    recovery: { id: 'mediaEnvironmentRecovery' },
  });
  expect(progress).toContainEqual(failure);
});

it('gives host dependencies actionable setup without turning vendor hints into AI repair authority', () => {
  const checks = requiredDoctorChecks(
    JSON.stringify({
      checks: ['Node.js', 'FFmpeg', 'FFprobe', 'Chrome'].map((name) => ({
        name,
        ok: false,
        detail: `Missing ${name} Ω`,
        hint: 'Vendor setup hint: install outside the project.',
      })),
    }),
  );
  expect(checks.every((check) => check.repairPrompt === null && check.status === 'missing')).toBe(true);
  expect(checks.map((check) => check.helpUrl)).toEqual([
    'https://github.com/igormidev/Vandashi#run-from-source',
    'https://ffmpeg.org/download.html',
    'https://ffmpeg.org/download.html',
    'https://hyperframes.heygen.com/packages/cli#browser',
  ]);
  for (const check of checks) {
    expect(check.diagnostic).toMatchObject({ kind: 'app' });
    expect(check.diagnostic?.kind === 'app' ? check.diagnostic.externalDetail : undefined).toContain(
      'Ω\nVendor setup hint: install outside the project.',
    );
    expect(check.detail).toContain('Vandashi');
    expect(check.detail).toContain('check again');
  }
});
