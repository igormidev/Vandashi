import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export async function nativeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-native-source-'));
  const bytes = 'Original fixture source and copyright notice.\r\n';
  async function put(file: string, text: string) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), text);
  }
  const manifest = {
    schemaVersion: 1,
    sharpVersion: '0.35.4',
    libvipsPackageVersion: '1.3.3',
    componentSets: { posix: { fixture: '1.0.0' }, windows: {}, wasm: {} },
    artifacts: [
      {
        id: 'fixture@1.0.0',
        file: 'fixture-source.txt',
        url: 'https://example.test/fixture-source.txt',
        size: Buffer.byteLength(bytes),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    ],
  };
  await put('scripts/native-sources.lock.json', JSON.stringify(manifest));
  await put(
    'package-lock.json',
    JSON.stringify({ packages: { 'node_modules/sharp': { version: '0.35.4' } } }),
  );
  for (const file of [
    'native-sources.mjs',
    'native-source-manifest.mjs',
    'native-source-download.mjs',
    'native-source-verify.mjs',
  ]) {
    await cp(join('scripts', file), join(root, 'scripts', file));
  }
  for (const file of [
    'src/example.ts',
    'third-party/LICENSE',
    'LICENSE',
    'README.md',
    'THIRD_PARTY_NOTICES.md',
    'package.json',
    'electron.vite.config.ts',
    'tsconfig.json',
    'build/icon.png',
    'docs/NATIVE-SOURCES.md',
  ]) {
    await put(file, 'Fixture material\n');
  }
  await put('package.json', JSON.stringify({ type: 'module' }));
  await put('build/native-source-cache/fixture-source.txt', bytes);
  await mkdir(join(root, 'node_modules'), { recursive: true });
  await symlink(
    resolve('node_modules/tar'),
    join(root, 'node_modules/tar'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  return {
    root,
    bytes,
    manifest,
    put,
    generate: (...args: string[]) =>
      run(process.execPath, ['scripts/native-sources.mjs', ...args], { cwd: root }),
    verify: () => run(process.execPath, ['scripts/native-source-verify.mjs'], { cwd: root }),
    archive: () => readFile(join(root, 'build/native-sources/vandashi-native-sources-sharp-0.35.4.tar.gz')),
  };
}
