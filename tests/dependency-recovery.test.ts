import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { checkMediaDependencies } from '../src/infrastructure/media/diagnostics';
import { applicationFixture } from './application-fixture';

it('preserves a real locked Git workspace, offers external recovery, and succeeds after the lock is released', async () => {
  const app = await applicationFixture();
  const script = join(app.path, 'script.md');
  const lock = join(app.path, '.git', 'index.lock');
  const originalHead = await app.git.head(app.path);
  try {
    await writeFile(script, 'Keep the interrupted edit Ω');
    await writeFile(lock, 'External Git operation');
    const checks = await app.api.checks({ scope: app.scope, video: false });
    expect(checks.find((check) => check.id === 'Codex')?.status).toBe('ready');
    const failed = checks.find((check) => check.id === 'Git');
    expect(failed).toMatchObject({
      status: 'error',
      repairPrompt: null,
      helpUrl: 'https://git-scm.com/downloads',
      diagnostic: {
        kind: 'external',
      },
      recovery: { id: 'appWorkspaceRecoveryRequired' },
    });
    expect(failed?.diagnostic?.kind === 'external' ? failed.diagnostic.text : undefined).toContain(
      'index.lock',
    );
    expect(await readFile(script, 'utf8')).toBe('Keep the interrupted edit Ω');
    expect(await readFile(lock, 'utf8')).toBe('External Git operation');
    expect(await app.git.head(app.path)).toBe(originalHead);
    await expect(app.api.sendChat(app.request)).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'appSaveBeforeAi' } },
    });
    expect(app.agent.run.mock.calls.every(([input]) => input.mode === 'read')).toBe(true);
    await rm(lock);
    expect(
      (await app.api.checks({ scope: app.scope, video: false })).every((check) => check.status === 'ready'),
    ).toBe(true);
    expect((await app.git.status(app.path)).dirty).toBe(false);
    expect(await app.git.head(app.path)).not.toBe(originalHead);
    expect(await readFile(script, 'utf8')).toBe('Keep the interrupted edit Ω');
  } finally {
    await app.idle();
    await app.cleanup();
  }
});

it.each(['app', 'app.asar.unpacked'])(
  'checks the actual %s runtime again after external recovery',
  async (directory) => {
    const root = await mkdtemp(join(tmpdir(), 'vandashi-runtime-recovery-'));
    const cliPath = join(root, directory, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
    const runtime = {
      nodePath: process.execPath,
      cliPath,
      environment: process.env,
      startupTimeoutMs: 1000,
      skillRoots: [],
    };
    try {
      const failed = await checkMediaDependencies(runtime);
      const hyperframes = failed.find((check) => check.id === 'hyperframes');
      expect(hyperframes).toMatchObject({
        status: 'error',
        repairPrompt: null,
        helpUrl: 'https://github.com/igormidev/Vandashi#run-from-source',
        diagnostic: {
          kind: 'external',
        },
        recovery: { id: 'mediaBundledRuntimeRecovery' },
      });
      expect(
        hyperframes?.diagnostic?.kind === 'external' ? hyperframes.diagnostic.text : undefined,
      ).toContain('Cannot find module');
      // A project-local installation cannot change the app runtime selected by the adapter.
      const projectCli = join(root, 'video', 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
      const readyCli = `console.log(process.argv.includes('--version') ? '0.8.64' : JSON.stringify({checks:['Node.js','FFmpeg','FFprobe','Chrome'].map(name=>({name,ok:true,detail:'Available'}))}));`;
      await mkdir(dirname(projectCli), { recursive: true });
      await writeFile(projectCli, readyCli);
      expect(
        (await checkMediaDependencies(runtime)).find((check) => check.id === 'hyperframes')?.status,
      ).toBe('error');
      await mkdir(dirname(cliPath), { recursive: true });
      await writeFile(cliPath, readyCli);
      const retry = await checkMediaDependencies(runtime);
      expect(retry.filter((check) => check.id !== 'skill').every((check) => check.status === 'ready')).toBe(
        true,
      );
      expect(retry.every((check) => check.repairPrompt === null)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
