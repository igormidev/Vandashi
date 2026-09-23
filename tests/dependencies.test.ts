import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DependencyCheck } from '../src/domain/models';
import { applicationFixture, type ApplicationFixture } from './application-fixture';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { requiredDoctorChecks } from '../src/infrastructure/media/diagnostics';

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
