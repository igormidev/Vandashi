import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export async function releaseManifest(directory, release) {
  const assets = {};
  const files = [];
  for (const name of await readdir(directory, { recursive: true })) {
    const path = join(directory, name);
    if ((await stat(path)).isFile()) files.push(path);
  }
  const targets = [
    ['darwin-arm64-dmg', 'mac-arm64.dmg'],
    ['darwin-arm64-zip', 'mac-arm64.zip'],
    ['win32-x64-exe', 'win-x64.exe'],
    // Electron Builder uses package-format architecture names in artifact filenames.
    ['linux-x64-AppImage', 'linux-x86_64.AppImage'],
    ['linux-x64-deb', 'linux-amd64.deb'],
  ];
  for (const [target, suffix] of targets) {
    const name = `Vandashi-${release.version}-${suffix}`;
    const matches = files.filter((path) => basename(path) === name);
    if (matches.length !== 1) throw new Error(`Exactly one verified installer is required: ${name}`);
    const path = matches[0];
    const size = (await stat(path)).size;
    if (size === 0) throw new Error(`Empty installer: ${name}`);
    const hash = createHash('sha512');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    assets[target] = { name, size, sha512: hash.digest('base64') };
  }
  for (const metadata of ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']) {
    const matches = files.filter((path) => basename(path) === metadata);
    if (matches.length !== 1) throw new Error(`Missing or duplicated updater metadata: ${metadata}`);
    const data = YAML.parse(await readFile(matches[0], 'utf8'));
    if (data.version !== release.version || !Array.isArray(data.files) || !data.files.length)
      throw new Error(`Wrong updater metadata: ${metadata}`);
    for (const entry of data.files) {
      const asset = Object.values(assets).find((item) => item.name === entry.url);
      if (!asset || asset.sha512 !== entry.sha512 || asset.size !== entry.size)
        throw new Error(`Updater checksum does not match the actual installer: ${entry.url}`);
    }
  }
  return { version: release.version, notes: release.notes, assets };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2] ?? 'release-artifacts');
  const release = JSON.parse(await readFile('release.json', 'utf8'));
  const manifest = await releaseManifest(directory, release);
  await writeFile(join(directory, 'update.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    join(directory, 'release-notes.md'),
    `${release.notes.map((note) => `- ${note}`).join('\n')}\n`,
  );
  await copyFile('THIRD_PARTY_NOTICES.md', join(directory, 'THIRD_PARTY_NOTICES.md'));
  await copyFile('LICENSE', join(directory, 'LICENSE.txt'));
  console.log(`Verified all installers and updater metadata for ${release.version}.`);
}
