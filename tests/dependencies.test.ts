import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DependencyCheck } from '../src/domain/models';
import { applicationFixture, type ApplicationFixture } from './application-fixture';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requiredDoctorChecks } from '../src/infrastructure/media/diagnostics';
import { AppFault } from '../src/domain/diagnostics';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

it('streams check progress, keeps diagnostics, and validates the installed skill with Codex', async () => {
  const mediaChecks: DependencyCheck[] = [
    {
      id: 'hyperframes',
      label: { id: 'mediaHyperframesLabel' },
      status: 'ready',
      detail: '',
      repairPrompt: null,
      helpUrl: null,
    },
    ...requiredDoctorChecks(
      JSON.stringify({
        checks: ['Node.js', 'FFmpeg', 'FFprobe', 'Chrome'].map((name) => ({
          name,
          ok: true,
          detail: 'Raw vendor detail',
        })),
      }),
    ),
    {
      id: 'skill',
      label: { id: 'mediaSkillLabel' },
      status: 'missing',
      detail: '',
      repairPrompt: null,
      helpUrl: null,
    },
  ];
  app.media.checks.mockImplementationOnce((onCheck) => {
    mediaChecks.forEach((check) => onCheck?.(check));
    return Promise.resolve(mediaChecks);
  });
  app.agent.capabilities.mockResolvedValueOnce({
    skills: [{ name: 'hyperframes', path: '/skills/hyperframes/SKILL.md', description: 'Video editing' }],
    plugins: [],
  });
  const checks = await app.api.checks({ scope: app.scope, video: true });
  expect(checks).toHaveLength(8);
  expect(checks.every((check) => check.status === 'ready')).toBe(true);
  expect(checks.find((check) => check.id === 'Git')?.diagnostic).toEqual({
    kind: 'app',
    message: { id: 'appWorkspaceSaved' },
  });
  expect(checks.find((check) => check.id === 'skill')?.diagnostic).toEqual({
    kind: 'app',
    message: { id: 'appHyperframesSkillReady' },
  });
  const progress = app.events.filter((event) => event.type === 'checks');
  expect(progress.map((event) => event.progress)).toEqual(
    [...progress.map((event) => event.progress)].sort((a, b) => a - b),
  );
  expect(progress[0]?.progress).toBe(0);
  expect(progress.at(-1)?.progress).toBe(1);
  expect(progress.find((event) => event.current === 'Hyperframes')?.currentLabel).toEqual({
    id: 'mediaHyperframesLabel',
  });
  for (const check of mediaChecks) {
    expect(check.label).toBeDefined();
    expect(progress.find((event) => event.current === check.id)?.currentLabel).toEqual(check.label);
    expect(checks.find((result) => result.id === check.id)?.label).toEqual(check.label);
    expect(progress.at(-1)?.checks.find((result) => result.id === check.id)?.label).toEqual(check.label);
  }
});

it('continues local diagnostics when Codex is unavailable and never reports success', async () => {
  vi.mocked(app.agent.connect).mockRejectedValueOnce(new Error('Codex is unavailable'));
  const checks = await app.api.checks({ scope: app.scope, video: false });
  expect(checks.find((check) => check.id === 'Codex')).toMatchObject({
    status: 'missing',
    repairPrompt: null,
  });
  expect(checks.find((check) => check.id === 'Codex')?.detail).toContain('unavailable');
  expect(checks.find((check) => check.id === 'Codex')?.diagnostic).toEqual({
    kind: 'external',
    text: 'Codex is unavailable',
  });
  expect(checks.find((check) => check.id === 'Git')?.status).toBe('ready');
});

it.each([
  { authenticated: false, usageAllowed: true, id: 'appCodexLoginRequired' },
  { authenticated: true, usageAllowed: false, id: 'appUsageExhausted' },
])('identifies $id without parsing a provider message', async ({ authenticated, usageAllowed, id }) => {
  app.agent.connect.mockResolvedValueOnce({
    connected: true,
    authenticated,
    usageAllowed,
    accountType: null,
    version: 'test',
  });
  const checks = await app.api.checks({ scope: null, video: false });
  expect(checks[0]).toMatchObject({ status: 'missing', diagnostic: { kind: 'app', message: { id } } });
});

it('publishes a clean refreshed workspace after entry recovers uncommitted files', async () => {
  const path = await app.store.projectPath(app.scope);
  await writeFile(join(path, 'script.md'), 'A recovered opening scene.');
  expect((await app.api.openWorkspace(app.scope)).dirty).toBe(true);
  app.events.length = 0;
  await app.api.checks({ scope: app.scope, video: true });
  expect((await app.api.openWorkspace(app.scope)).dirty).toBe(false);
  const changed = app.events.findIndex((event) => event.type === 'workspace-changed');
  const idle = app.events.findIndex((event) => event.type === 'activity' && event.activity.phase === 'done');
  expect(changed).toBeGreaterThan(idle);
  expect(changed).toBeGreaterThanOrEqual(0);
});

it('keeps ChatGPT usage retries blocked until fresh permission is verified', async () => {
  app.media.checks.mockResolvedValue(requiredDoctorChecks('{"checks":[]}'));
  for (const usageAllowed of [false, null, null, true]) {
    app.agent.connect.mockResolvedValueOnce({
      connected: true,
      authenticated: true,
      accountType: 'chatgpt',
      usageAllowed,
      version: 'test',
    });
    const checks = await app.api.checks({ scope: app.scope, video: true });
    expect(checks.find((check) => check.id === 'Codex')).toMatchObject(
      usageAllowed === true
        ? { status: 'ready' }
        : {
            status: 'missing',
            diagnostic: {
              kind: 'app',
              message: { id: usageAllowed === false ? 'appUsageExhausted' : 'appUsageUnverified' },
            },
          },
    );
    expect(checks.find((check) => check.id === 'media-ffmpeg')?.repairPrompt).toBeNull();
    expect(app.agent.capabilities).toHaveBeenCalledTimes(usageAllowed === true ? 1 : 0);
  }
});

it.each(['apiKey', 'amazonBedrock', null])(
  'does not require ChatGPT subscription usage for an authenticated %s provider',
  async (accountType) => {
    app.agent.connect.mockResolvedValueOnce({
      connected: true,
      authenticated: true,
      accountType,
      usageAllowed: null,
      version: 'test',
    });
    expect((await app.api.checks({ scope: null, video: false }))[0]?.status).toBe('ready');
  },
);

it.each(['streamed', 'returned'])(
  'does not advertise an unverified host repair from a %s media check',
  async (delivery) => {
    const check: DependencyCheck = {
      id: 'media-ffmpeg',
      status: 'missing',
      detail: 'External host tool missing',
      repairPrompt: 'Install a host tool outside repository roots',
      helpUrl: 'https://ffmpeg.org/download.html',
    };
    app.media.checks.mockImplementationOnce((onCheck) => {
      if (delivery === 'streamed') onCheck?.(check);
      return Promise.resolve([check]);
    });
    const checks = await app.api.checks({ scope: app.scope, video: true });
    expect(checks.find((value) => value.id === 'Codex')?.status).toBe('ready');
    expect(checks.find((value) => value.id === check.id)).toMatchObject({
      repairPrompt: null,
      helpUrl: check.helpUrl,
    });
    expect(
      app.events
        .filter((event) => event.type === 'checks')
        .flatMap((event) => event.checks)
        .every((value) => value.repairPrompt === null),
    ).toBe(true);
  },
);

it.each(['absent', 'auxiliary'])(
  'rejects an %s core skill despite a ready filesystem check and recovers on retry',
  async (variant) => {
    app.media.checks.mockResolvedValue([
      {
        id: 'skill',
        status: 'ready',
        detail: '/skills/hyperframes/SKILL.md',
        repairPrompt: 'Install globally',
        helpUrl: null,
      },
    ]);
    app.agent.capabilities.mockResolvedValueOnce({
      skills:
        variant === 'auxiliary'
          ? [{ name: 'hyperframes-audio', path: '/skills/hyperframes-audio/SKILL.md', description: 'Audio' }]
          : [],
      plugins: [],
    });
    const first = await app.api.checks({ scope: app.scope, video: true });
    expect(first.filter((check) => check.id === 'skill')).toHaveLength(1);
    expect(first.find((check) => check.id === 'skill')).toMatchObject({
      status: 'missing',
      repairPrompt: null,
      helpUrl: 'https://hyperframes.heygen.com/guides/skills',
      diagnostic: { kind: 'app', message: { id: 'appHyperframesSkillMissing' } },
    });
    app.agent.capabilities.mockResolvedValueOnce({
      skills: [{ name: 'hyperframes', path: '/skills/hyperframes/SKILL.md', description: 'Core workflow' }],
      plugins: [],
    });
    const retry = await app.api.checks({ scope: app.scope, video: true });
    expect(retry.every((check) => check.status === 'ready')).toBe(true);
  },
);

it('keeps failed live skill discovery unverified and requires a fresh successful retry', async () => {
  app.agent.capabilities.mockRejectedValueOnce(new Error('skills/list disconnected Ω'));
  const failed = await app.api.checks({ scope: app.scope, video: true });
  expect(failed.find((check) => check.id === 'skill')).toMatchObject({
    status: 'error',
    repairPrompt: null,
    diagnostic: {
      kind: 'external',
      text: 'skills/list disconnected Ω',
    },
    recovery: { id: 'appHyperframesSkillUnverified' },
  });
  app.agent.capabilities.mockResolvedValueOnce({
    skills: [{ name: 'hyperframes', path: '/skills/hyperframes/SKILL.md', description: 'Core workflow' }],
    plugins: [],
  });
  expect(
    (await app.api.checks({ scope: app.scope, video: true })).find((check) => check.id === 'skill')?.status,
  ).toBe('ready');
});

it.each([
  new AppFault({ id: 'gitDirectoryNotLocal' }),
  new AppFault({ id: 'appRepositorySaveFailed', params: { repository: '/workspace/夏/video' } }),
  new AppFault(
    { id: 'storageMetadataInvalid', params: { name: 'brand_config.yml' } },
    'Parser detail Ω\nKeep this verbatim.',
  ),
])('retains the typed Git cause separately from recovery guidance (%#)', async (error) => {
  vi.spyOn(app.git, 'status').mockRejectedValueOnce(error);
  const checks = await app.api.checks({ scope: { ...app.scope, videoId: null }, video: false });
  const failed = checks.find((check) => check.id === 'Git');
  expect(failed).toMatchObject({
    status: 'error',
    detail: error.message,
    diagnostic: error.diagnostic,
    recovery: { id: 'appWorkspaceRecoveryRequired' },
    repairPrompt: null,
  });
  expect(app.events.filter((event) => event.type === 'checks').at(-1)?.checks).toContainEqual(failed);
});

it('retains typed live skill failures without converting their parameters to raw English', async () => {
  const error = new AppFault({ id: 'codexRequestTimeout', params: { method: 'skills/list' } });
  app.agent.capabilities.mockRejectedValueOnce(error);
  const checks = await app.api.checks({ scope: app.scope, video: true });
  expect(checks.find((check) => check.id === 'skill')).toMatchObject({
    status: 'error',
    diagnostic: error.diagnostic,
    detail: error.message,
    recovery: { id: 'appHyperframesSkillUnverified' },
  });
});

it.each([
  { connected: false, authenticated: true, usageAllowed: true },
  { connected: true, authenticated: false, usageAllowed: true },
  { connected: true, authenticated: true, usageAllowed: false },
])(
  'removes impossible repair prompts while Codex is $connected/$authenticated/$usageAllowed',
  async (status) => {
    app.agent.connect.mockResolvedValueOnce({ ...status, accountType: null, version: 'test' });
    app.media.checks.mockResolvedValueOnce([
      {
        id: 'media-ffmpeg',
        status: 'missing',
        detail: 'Missing runtime',
        repairPrompt: 'Repair the local runtime',
        helpUrl: 'https://hyperframes.heygen.com/quickstart',
      },
    ]);
    const checks = await app.api.checks({ scope: app.scope, video: true });
    expect(checks.find((check) => check.id === 'Codex')?.status).toBe('missing');
    expect(checks.every((check) => check.repairPrompt === null)).toBe(true);
    expect(checks.find((check) => check.id === 'media-ffmpeg')?.helpUrl).toBe(
      'https://hyperframes.heygen.com/quickstart',
    );
    expect(checks.find((check) => check.id === 'skill')?.status).not.toBe('ready');
    expect(app.agent.capabilities).not.toHaveBeenCalled();
  },
);
