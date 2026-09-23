import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { codexLaunch } from '../src/infrastructure/codex/launch';

const execute = promisify(execFile);
it('runs a Node launcher with a minimal desktop PATH and removes the Electron switch before its children', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vandashi-codex-launch-'));
  try {
    const binary = join(directory, 'launcher.mjs');
    await writeFile(
      binary,
      '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({args:process.argv.slice(1),flag:process.env.ELECTRON_RUN_AS_NODE ?? null}));',
    );
    const environment = { PATH: '/usr/bin:/bin', PRESERVED: 'yes' };
    const launch = codexLaunch(binary, ['app-server', '--stdio'], environment);
    expect(launch.command).toBe(process.execPath);
    expect(launch.environment['PRESERVED']).toBe('yes');
    expect(environment.PATH).toBe('/usr/bin:/bin');
    const result = await execute(launch.command, launch.args, { env: launch.environment });
    const output: unknown = JSON.parse(result.stdout);
    expect(output).toEqual({ args: [binary, 'app-server', '--stdio'], flag: null });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('leaves native executables and explicit argument boundaries intact', () => {
  const launch = codexLaunch(process.execPath, ['--version'], { PATH: '/usr/bin:/bin' });
  expect(launch.command).toBe(process.execPath);
  expect(launch.args).toEqual(['--version']);
  expect(launch.environment).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
});
