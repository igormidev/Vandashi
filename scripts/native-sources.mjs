import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  writeFile,
  rm,
  lstat,
  chmod,
  rename,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { create } from 'tar';
import { collectSources } from './native-source-download.mjs';
import { validateManifest, verifyInstalledVersions, hashFile } from './native-source-manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const allowed = new Set(['--offline', '--verify-only', '--check']);
if ([...args].some((argument) => !allowed.has(argument))) {
  throw new Error('Usage: node scripts/native-sources.mjs [--offline] [--verify-only] [--check]');
}
const manifestPath = join(root, 'scripts/native-sources.lock.json');
const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
const observed = await verifyInstalledVersions(root, manifest);
if (args.has('--check')) {
  console.log('Native source version coverage verified.');
  process.exit(0);
}
const cache = join(root, 'build/native-source-cache');
await collectSources(manifest, cache, args.has('--offline'));
if (args.has('--verify-only')) process.exit(0);

const output = join(root, 'build/native-sources');
await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(output, '.staging-'));
const fileHashes = {};

async function include(source, destination) {
  const metadata = await lstat(source);
  if (metadata.isSymbolicLink()) throw new Error(`Source snapshot refuses symbolic link: ${source}`);
  if (metadata.isDirectory()) {
    for (const name of (await readdir(source)).sort())
      await include(join(source, name), `${destination}/${name}`);
  } else if (metadata.isFile()) {
    const target = join(staging, destination);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    await chmod(target, 0o644);
    fileHashes[destination] = await hashFile(target);
  }
}

try {
  for (const entry of manifest.artifacts) await include(join(cache, entry.file), `archives/${entry.file}`);
  await include(manifestPath, 'native-sources.lock.json');
  await include(join(root, 'docs/NATIVE-SOURCES.md'), 'README.md');
  const appFiles = [
    'src',
    'scripts',
    'third-party',
    'docs',
    'LICENSE',
    'README.md',
    'THIRD_PARTY_NOTICES.md',
    'package.json',
    'package-lock.json',
    'electron.vite.config.ts',
    'tsconfig.json',
    'build/icon.png',
  ];
  for (const file of appFiles) await include(join(root, file), `vandashi-source/${file}`);
  const receipt = {
    sourceManifestSha256: await hashFile(manifestPath),
    applicationLockSha256: await hashFile(join(root, 'package-lock.json')),
    observedNativeComponents: observed,
    payloadCount: manifest.artifacts.length,
    payloadBytes: manifest.artifacts.reduce((total, entry) => total + entry.size, 0),
    files: Object.fromEntries(Object.entries(fileHashes).sort(([a], [b]) => a.localeCompare(b, 'en'))),
  };
  await writeFile(join(staging, 'CONTENTS.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  const archive = join(output, `vandashi-native-sources-sharp-${manifest.sharpVersion}.tar.gz`);
  await create(
    {
      cwd: staging,
      file: `${archive}.writing`,
      gzip: { level: 1 },
      portable: true,
      noMtime: true,
    },
    [...Object.keys(fileHashes), 'CONTENTS.json'].sort(),
  );
  const checksum = await hashFile(`${archive}.writing`);
  await rename(`${archive}.writing`, archive);
  await writeFile(
    `${archive}.sha256`,
    `${checksum}  vandashi-native-sources-sharp-${manifest.sharpVersion}.tar.gz\n`,
  );
  console.log(`Created ${archive}\nSHA-256: ${checksum}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
