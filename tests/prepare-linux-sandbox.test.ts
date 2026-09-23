import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const execute = promisify(execFile);
const script = resolve('scripts/prepare-linux-sandbox.mjs');
const runner = {
  platform: 'linux',
  uid: 1001,
  environment: {
    GITHUB_ACTIONS: 'true',
    RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_OS: 'Linux',
    GITHUB_RUN_ID: '35926614889',
  },
  restriction: '1\n',
  osRelease: 'NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"\n',
  executable: '/home/runner/work/Vandashi/Vandashi/node_modules/electron/dist/electron',
  workspace: '/home/runner/work/Vandashi/Vandashi',
  temporaryDirectory: '/home/runner/work/_temp',
};

it('resolves a lazily installed Electron binary without confusing download output with its path', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vandashi-lazy-electron-'));
  try {
    const moduleRoot = join(directory, 'node_modules/electron');
    await mkdir(moduleRoot, { recursive: true });
    await writeFile(join(directory, 'package.json'), '{}');
    await writeFile(
      join(moduleRoot, 'index.js'),
      `const fs = require('node:fs');
const path = require('node:path');
const binary = path.join(__dirname, 'dist/electron');
if (!fs.existsSync(binary)) {
  console.log('Downloading Electron binary...');
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.writeFileSync(binary, 'fixture executable');
}
module.exports = binary;`,
    );
    const code = `import { resolveSandboxExecutable } from ${JSON.stringify(pathToFileURL(script).href)};
console.log(JSON.stringify(await resolveSandboxExecutable('--electron', ${JSON.stringify(join(directory, 'package.json'))})));`;
    const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', code]);
    const binary = join(moduleRoot, 'dist/electron');
    expect(stdout.trim().split(/\r?\n/)).toEqual([
      'Downloading Electron binary...',
      JSON.stringify(await realpath(binary)),
    ]);
    expect(await readFile(binary, 'utf8')).toBe('fixture executable');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('uses an explicit packaged path without loading an Electron package', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vandashi-explicit-executable-'));
  try {
    const binary = join(directory, 'vandashi');
    await writeFile(binary, 'packaged fixture');
    const code = `import { resolveSandboxExecutable } from ${JSON.stringify(pathToFileURL(script).href)};
console.log(JSON.stringify(await resolveSandboxExecutable(${JSON.stringify(binary)}, ${JSON.stringify(join(directory, 'package.json'))})));`;
    const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', code]);
    expect(JSON.parse(stdout)).toBe(await realpath(binary));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function plan(input: unknown) {
  const code = `import { linuxSandboxPlan } from ${JSON.stringify(pathToFileURL(script).href)};
process.stdout.write(JSON.stringify(linuxSandboxPlan(${JSON.stringify(input)})));`;
  return (await execute(process.execPath, ['--input-type=module', '-e', code])).stdout;
}

it('grants only the exact quoted job executable user namespaces without persistent or global changes', async () => {
  const executable = '/home/runner/work/_temp/AppImage with spaces/vandashi';
  const result = await plan({ ...runner, executable });
  expect(result).toContain('"status":"required"');
  expect(result).toContain('flags=(unconfined)');
  expect(result).toContain('userns,');
  expect(result).toContain(JSON.stringify(`"${executable}"`).slice(1, -1));
  expect(result).not.toMatch(/\*|\/etc\/apparmor|sysctl|no-sandbox|capability/);
  expect(await plan({ ...runner, executable })).toBe(result);
  expect(await plan(runner)).not.toBe(result);
});

it.each([null, '0\n'])(
  'does not request a profile when namespace restrictions are %s',
  async (restriction) => {
    expect(await plan({ ...runner, restriction })).toContain('"status":"not-required"');
  },
);

it.each([
  { platform: 'darwin' },
  { platform: 'win32' },
  { uid: 0 },
  { environment: { ...runner.environment, GITHUB_ACTIONS: 'false' } },
  { environment: { ...runner.environment, RUNNER_ENVIRONMENT: 'self-hosted' } },
  { environment: { ...runner.environment, RUNNER_OS: 'Windows' } },
  { environment: { ...runner.environment, GITHUB_RUN_ID: '' } },
])('rejects non-hosted/non-Linux/root mutation contexts: %j', async (change) => {
  await expect(plan({ ...runner, ...change })).rejects.toThrow('GitHub-hosted Linux runner');
});

it.each([
  '/usr/bin/electron',
  '/home/runner/work/Vandashi/Vandashi-other/vandashi',
  '/home/runner/work/Vandashi/Vandashi/../vandashi',
  'node_modules/electron/dist/electron',
  '/home/runner/work/_temp/*/vandashi',
  '/home/runner/work/_temp/[ab]/vandashi',
  '/home/runner/work/_temp/{ab}/vandashi',
  '/home/runner/work/_temp/@{HOME}/vandashi',
  '/home/runner/work/_temp/"evil"/vandashi',
  '/home/runner/work/_temp/evil\n/vandashi',
  '/home/runner/work/_temp/evil\0/vandashi',
  '/home/runner/work/_temp/evil\\/vandashi',
  '/home/runner/work/_temp/bash',
])('rejects broadened, injected or non-job executable paths: %s', async (executable) => {
  await expect(plan({ ...runner, executable })).rejects.toThrow();
});

it('fails closed on an unrecognized kernel restriction value', async () => {
  await expect(plan({ ...runner, restriction: 'unexpected' })).rejects.toThrow('restriction value');
});

it.each(['ID=fedora\n', 'ID_LIKE=ubuntu\n', ''])(
  'rejects unsupported restricted hosts: %s',
  async (osRelease) => {
    await expect(plan({ ...runner, osRelease })).rejects.toThrow('only on Ubuntu');
  },
);

it.each([runner.executable, '--electron'])(
  'rejects direct CLI use outside Actions before resolving %s or changing host policy',
  async (selection) => {
    await expect(
      execute(process.execPath, [script, selection], {
        env: { ...process.env, GITHUB_ACTIONS: 'false' },
      }),
    ).rejects.toThrow('GitHub-hosted Linux runner');
  },
);
