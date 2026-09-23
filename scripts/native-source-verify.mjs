import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { list } from 'tar';
import { validateManifest, hashFile } from './native-source-manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'scripts/native-sources.lock.json');
const manifest = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
const file = join(
  root,
  'build/native-sources',
  `vandashi-native-sources-sharp-${manifest.sharpVersion}.tar.gz`,
);
const checksum = (await readFile(`${file}.sha256`, 'utf8')).split(' ')[0];
if ((await hashFile(file)) !== checksum) throw new Error('Native source archive checksum mismatch.');
const actual = new Map();
let receiptBytes;
await list({
  file,
  onReadEntry(entry) {
    if (
      entry.type !== 'File' ||
      actual.has(entry.path) ||
      entry.path.startsWith('/') ||
      entry.path.includes('..')
    ) {
      throw new Error(`Unexpected native source archive entry: ${entry.path}`);
    }
    const hash = createHash('sha256');
    const chunks = [];
    actual.set(entry.path, null);
    entry.on('data', (chunk) => {
      hash.update(chunk);
      if (entry.path === 'CONTENTS.json') chunks.push(chunk);
    });
    entry.on('end', () => {
      actual.set(entry.path, hash.digest('hex'));
      if (entry.path === 'CONTENTS.json') receiptBytes = Buffer.concat(chunks);
    });
  },
});
if (!receiptBytes) throw new Error('Native source archive has no contents receipt.');
const receipt = JSON.parse(receiptBytes.toString());
const manifestHash = await hashFile(manifestPath);
if (
  receipt.sourceManifestSha256 !== manifestHash ||
  actual.get('native-sources.lock.json') !== manifestHash
) {
  throw new Error('Native source archive was built from a different source manifest.');
}
for (const [path, hash] of Object.entries(receipt.files)) {
  if (actual.get(path) !== hash) throw new Error(`Native source archive entry mismatch: ${path}`);
}
if (actual.size !== Object.keys(receipt.files).length + 1)
  throw new Error('Unlisted native source archive files.');
for (const entry of manifest.artifacts) {
  if (actual.get(`archives/${entry.file}`) !== entry.sha256) {
    throw new Error(`Source payload absent or changed inside archive: ${entry.file}`);
  }
}
if (
  receipt.applicationLockSha256 !== actual.get('vandashi-source/package-lock.json') ||
  receipt.applicationLockSha256 !== (await hashFile(join(root, 'package-lock.json')))
) {
  throw new Error('Application source lock does not match the source receipt.');
}
console.log(`Verified ${manifest.artifacts.length} native payloads and ${actual.size} archive files.`);
