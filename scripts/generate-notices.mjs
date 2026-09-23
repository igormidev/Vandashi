import { createHash } from 'node:crypto';
import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const sources = JSON.parse(await readFile(join(root, 'third-party/sources.json'), 'utf8'));
const sections = new Map();
const inventory = [];
const digest = (data) => createHash('sha256').update(data).digest('hex');
const licenseName = /^(licen[sc]e|notice|copying|third[-_]party[-_]licenses|third[-_]party[-_]notices)/i;

async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function add(data, attribution) {
  const hash = digest(data);
  const existing = sections.get(hash);
  if (existing) existing.attributions.push(attribution);
  else sections.set(hash, { data, attributions: [attribution] });
}

async function recordedFile(record, owner) {
  const file = resolve(root, record.file);
  const rel = relative(join(root, 'third-party'), file);
  if (rel.startsWith('..') || resolve(join(root, 'third-party'), rel) !== file) {
    throw new Error(`Invalid supplemental notice path: ${record.file}`);
  }
  const bytes = await readFile(file);
  if (digest(bytes) !== record.sha256) throw new Error(`Supplemental notice changed: ${record.file}`);
  add(bytes, `${owner}\nSource: ${record.source}\nRecord: ${record.file}`);
}

async function packageFile(directory, file, owner) {
  const bytes = await readFile(join(directory, file));
  add(bytes, `${owner}\nSource: ${relative(root, join(directory, file)).replaceAll('\\', '/')}`);
}

async function archiveNotices(directory, file, owner) {
  const archive = join(directory, file);
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(await readFile(archive));
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (entry.header.size > 5_000_000) {
      throw new Error(`Unexpectedly large license entry: ${entry.entryName}`);
    }
    add(entry.getData(), `${owner}\nSource: ${file}!/${entry.entryName}`);
  }
}

async function supplemental(name, version, directory) {
  const id = `${name}@${version}`;
  const record = sources.packages[id];
  if (record) {
    inventory.push(`  Source record: ${record.reason}`);
    for (const file of record.files) await recordedFile(file, id);
    return true;
  }
  if (name.startsWith('@esbuild/') && version === '0.25.12') {
    for (const file of sources.packages['@esbuild/darwin-arm64@0.25.12'].files) {
      await recordedFile(file, `${id} — esbuild license, same upstream version`);
    }
    return true;
  }
  if (
    (name.startsWith('@img/sharp-libvips-') && version === '1.3.3') ||
    (name.startsWith('@img/sharp-win32-') && version === '0.35.4')
  ) {
    await packageFile(directory, 'README.md', `${id} — native component notices`);
    await packageFile(directory, 'versions.json', `${id} — exact native component versions`);
    for (const file of sources.packages['@img/sharp-libvips-darwin-arm64@1.3.3'].files) {
      if (/\/(L?GPL-3\.0)\.txt$/.test(file.file)) await recordedFile(file, id);
    }
    return true;
  }
  if (name === 'exiftool-vendored.exe' && version === '13.59.2') {
    await packageFile(directory, 'bin/exiftool_files/LICENSE', `${id} — bundled runtime license file`);
    await packageFile(directory, 'bin/exiftool_files/readme_windows.txt', id);
    await packageFile(directory, 'vendor-manifest.json', `${id} — exact upstream archive provenance`);
    await archiveNotices(directory, 'bin/exiftool_files/Licenses_Strawberry_Perl.zip', id);
    return true;
  }
  return false;
}

for (const [location, locked] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  if (!location || locked.dev) continue;
  if (!location.startsWith('node_modules/') || location.includes('..')) {
    throw new Error(`Unexpected production package path: ${location}`);
  }
  const directory = join(root, location);
  if (!(await exists(join(directory, 'package.json')))) {
    if (locked.optional) continue;
    throw new Error(`Missing production dependency: ${location}`);
  }
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (pkg.version !== locked.version) throw new Error(`Lockfile version mismatch: ${location}`);
  const id = `${pkg.name}@${pkg.version}`;
  inventory.push(`${id} | ${pkg.license ?? 'see upstream LICENSE'} | ${location}`);
  const files = (await readdir(directory)).filter((file) => licenseName.test(file)).sort();
  let fileCount = 0;
  for (const file of files) {
    if (!(await exists(join(directory, file)))) continue;
    await packageFile(directory, file, id);
    fileCount += 1;
  }
  const supplied = await supplemental(pkg.name, pkg.version, directory);
  if (!fileCount && !supplied) {
    throw new Error(`Missing license text/source record for ${id}; review the exact upstream version.`);
  }
}

for (const record of sources.extras) await recordedFile(record, 'Reference / supplemental attribution');
await packageFile(join(root, 'node_modules/electron'), 'LICENSE', 'Electron runtime');
if (!(await exists(join(root, 'node_modules/electron/dist/LICENSES.chromium.html')))) {
  throw new Error('Missing Electron Chromium notices; install the Electron runtime before packaging.');
}

const output = [
  Buffer.from(
    'Vandashi — third-party license texts and source records\n' +
      `Target installation: ${process.platform}/${process.arch}\n` +
      `package-lock.json SHA-256: ${digest(await readFile(join(root, 'package-lock.json')))}\n\n` +
      'Generated by scripts/generate-notices.mjs. Original text bytes are unchanged.\n' +
      'Identical files share one section; each source is listed.\n' +
      'See THIRD_PARTY_NOTICES.md for provenance and stated review limits.\n' +
      'Electron Chromium notices accompany this file as LICENSES.chromium.html.\n\n' +
      inventory.join('\n') +
      '\n',
  ),
];
for (const [hash, section] of sections) {
  output.push(
    Buffer.from(`\n\n${'='.repeat(78)}\n${section.attributions.join('\n\n')}\nSHA-256: ${hash}\n\n`),
  );
  output.push(section.data);
}
const destination = join(root, 'build/THIRD_PARTY_LICENSES.txt');
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, Buffer.concat(output));
console.log(`Wrote ${relative(root, destination)} (${sections.size} distinct notices).`);
