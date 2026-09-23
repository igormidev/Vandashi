import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { environmentLines } from './prepare-packaged-smoke.mjs';

const execute = promisify(execFile);
if (process.platform !== 'linux') throw new Error('AppImage extraction requires Linux.');
const release = resolve('release');
const images = (await readdir(release)).filter((name) => name.endsWith('.AppImage'));
if (images.length !== 1) throw new Error(`Expected one AppImage; found ${images.length}.`);
const artifact = join(release, images[0]);
const extraction = await mkdtemp(join(release, 'appimage-smoke-'));
await execute(artifact, ['--appimage-extract'], {
  cwd: extraction,
  timeout: 120_000,
  maxBuffer: 16 * 1024 * 1024,
});
const appdir = join(extraction, 'squashfs-root');
const { stdout } = await execute(process.execPath, [
  resolve('scripts/verify-linux-package.mjs'),
  '--appdir',
  appdir,
]);
const verification = JSON.parse(stdout);
const environment = {
  VANDASHI_PACKAGED_APP: join(appdir, 'vandashi'),
  VANDASHI_PACKAGED_LAUNCHER: join(appdir, 'AppRun'),
};
const hash = createHash('sha256');
for await (const chunk of createReadStream(artifact)) hash.update(chunk);
const evidence = {
  artifact,
  sha256: hash.digest('hex'),
  verification,
  environment,
};
await mkdir('test-results', { recursive: true });
await writeFile('test-results/linux-package.json', `${JSON.stringify(evidence, null, 2)}\n`);
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, environmentLines(environment));
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
