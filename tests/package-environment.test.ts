import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { minimalDesktopEnvironment } from './package-environment';

const execute = promisify(execFile);
const roots: string[] = [];
async function temporary() {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-package-helper-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 3 })));
});

it('keeps only Git and OS paths for Windows while preserving SystemRoot and explicit tool paths', () => {
  const environment = minimalDesktopEnvironment(
    {
      Path: 'C:\\developer\\node',
      PATH: 'C:\\another\\npm',
      SystemRoot: 'C:\\Windows',
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: 'C:\\developer\\modules',
      HYPERFRAMES_FFMPEG_PATH: 'C:\\media tools\\ffmpeg.exe',
    },
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'win32',
  );
  expect(environment['PATH']).toBe('C:\\Program Files\\Git\\cmd;C:\\Windows\\System32;C:\\Windows');
  expect(environment['Path']).toBeUndefined();
  expect(environment['SystemRoot']).toBe('C:\\Windows');
  expect(environment['HYPERFRAMES_FFMPEG_PATH']).toBe('C:\\media tools\\ffmpeg.exe');
  expect(environment['ELECTRON_RUN_AS_NODE']).toBeUndefined();
  expect(environment['NODE_PATH']).toBeUndefined();
  expect(() => minimalDesktopEnvironment({}, 'C:\\Git\\git.exe', 'win32')).toThrow('SystemRoot');
});

it('preserves a nonstandard Git location without retaining the developer shell PATH on POSIX', () => {
  const environment = minimalDesktopEnvironment(
    {
      PATH: '/developer/node:/developer/npm',
      DISPLAY: ':99',
      ELECTRON_RENDERER_URL: 'http://localhost:5173',
    },
    '/custom/git/bin/git',
    'linux',
  );
  expect(environment['PATH']).toBe('/custom/git/bin:/usr/bin:/bin:/usr/sbin:/sbin');
  expect(environment['DISPLAY']).toBe(':99');
  expect(environment['ELECTRON_RENDERER_URL']).toBeUndefined();
});

it.each([
  ['linux', 'linux-unpacked/vandashi'],
  ['win32', 'win-unpacked/Vandashi.exe'],
  ['darwin', 'mac-arm64/Vandashi.app/Contents/MacOS/Vandashi'],
])('discovers only the %s unpacked application, including paths with spaces', async (platform, suffix) => {
  const root = await temporary();
  const directory = join(root, 'packaged application');
  const path = join(directory, suffix);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, 'Native executable fixture');
  await writeFile(join(directory, 'Vandashi-installer.exe'), 'Installer is not the runtime');
  const module = pathToFileURL(resolve('scripts/prepare-packaged-smoke.mjs')).href;
  const code = `import { packagedExecutable } from ${JSON.stringify(module)};
process.stdout.write(await packagedExecutable(${JSON.stringify(directory)}, ${JSON.stringify(platform)}));`;
  expect((await execute(process.execPath, ['--input-type=module', '-e', code])).stdout).toBe(path);
  await rm(path);
  await expect(execute(process.execPath, ['--input-type=module', '-e', code])).rejects.toThrow('found 0');
});

it('does not turn a path containing a newline into an extra GitHub environment assignment', async () => {
  const module = pathToFileURL(resolve('scripts/prepare-packaged-smoke.mjs')).href;
  const code = `import { environmentLines } from ${JSON.stringify(module)};
process.stdout.write(environmentLines({VANDASHI_PACKAGED_APP:'valid\\nUNEXPECTED=value'}));`;
  await expect(execute(process.execPath, ['--input-type=module', '-e', code])).rejects.toThrow(
    'Unsafe GitHub environment-file value',
  );
});

it('verifies the actual committed speech recordings and rejects a modified local copy offline', async () => {
  const script = resolve('scripts/restore-speech-fixtures.mjs');
  expect((await execute(process.execPath, [script])).stdout).toContain('Verified portuguese.wav');
  const root = await temporary();
  await cp('tests/fixtures/speech', root, { recursive: true });
  await writeFile(join(root, 'portuguese.wav'), 'Changed source');
  await expect(execute(process.execPath, [script, '--output', root])).rejects.toThrow(
    'Speech checksum/size mismatch: portuguese.wav',
  );
});
