import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';

export function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length) {
    throw new Error('Invalid native source manifest.');
  }
  const ids = new Set();
  const names = new Set();
  for (const entry of manifest.artifacts) {
    if (
      typeof entry.id !== 'string' ||
      typeof entry.file !== 'string' ||
      typeof entry.sha256 !== 'string' ||
      typeof entry.url !== 'string' ||
      ids.has(entry.id) ||
      names.has(entry.file) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.+-]{0,180}$/.test(entry.file) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size <= 0 ||
      entry.size > 1_073_741_824 ||
      new URL(entry.url).protocol !== 'https:'
    ) {
      throw new Error(`Invalid or duplicate native source entry: ${String(entry.id)}`);
    }
    ids.add(entry.id);
    names.add(entry.file);
  }
  for (const [target, components] of Object.entries(manifest.componentSets)) {
    for (const [component, version] of Object.entries(components)) {
      if (!ids.has(`${component}@${version}`)) {
        throw new Error(`Missing native source coverage: ${target}/${component}@${version}`);
      }
    }
  }
  return manifest;
}

export async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

export async function verifyPayload(file, entry) {
  let metadata;
  try {
    metadata = await lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (!metadata.isFile() || metadata.size !== entry.size || (await hashFile(file)) !== entry.sha256) {
    throw new Error(`Native source checksum/size mismatch: ${entry.file}`);
  }
  return true;
}

export async function verifyInstalledVersions(root, manifest) {
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  if (lock.packages['node_modules/sharp']?.version !== manifest.sharpVersion) {
    throw new Error('Update the native source manifest for the locked sharp version.');
  }
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (
      location.startsWith('node_modules/@img/sharp-libvips-') &&
      entry.version !== manifest.libvipsPackageVersion
    ) {
      throw new Error(`Update native source provenance for ${location}@${entry.version}`);
    }
  }
  const img = join(root, 'node_modules/@img');
  let names = [];
  try {
    names = await readdir(img);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const observed = {};
  for (const name of names.sort()) {
    if (!name.startsWith('sharp-')) continue;
    let versions;
    try {
      versions = JSON.parse(await readFile(join(img, name, 'versions.json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const group = name.includes('wasm32') ? 'wasm' : name.includes('win32') ? 'windows' : 'posix';
    for (const [component, version] of Object.entries(versions)) {
      if (manifest.componentSets[group][component] !== version) {
        throw new Error(`Unreviewed native component: ${name}/${component}@${version}`);
      }
    }
    observed[name] = versions;
  }
  return observed;
}
