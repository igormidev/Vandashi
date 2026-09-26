import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper';
import { quarantineInstaller, verifyInstaller } from '../src/infrastructure/updates/installer-download';

it('invalidates the actual upstream in-process cache so the same release can download fresh bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vandashi-native-cache-'));
  try {
    const helper = new DownloadedUpdateHelper(directory);
    const path = join(directory, 'installer.exe');
    const original = Buffer.from('verified installer');
    const asset = {
      name: 'installer.exe',
      size: original.length,
      sha512: createHash('sha512').update(original).digest('base64'),
    };
    const info = {
      version: '0.2.0',
      releaseDate: '2026-09-26',
      files: [{ url: asset.name, size: asset.size, sha512: asset.sha512 }],
      path: asset.name,
      sha512: asset.sha512,
    };
    const file = {
      url: new URL('https://github.com/igormidev/Vandashi/releases/download/v0.2.0/installer.exe'),
      info: { url: asset.name, size: asset.size, sha512: asset.sha512 },
    };
    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
    await writeFile(path, original);
    await helper.setDownloadedFile(path, null, info, file, asset.name, false);
    await writeFile(path, Buffer.alloc(original.length));
    expect(await helper.validateDownloadedPath(path, info, file, logger)).toBe(path);
    await expect(verifyInstaller(path, asset)).rejects.toThrow();
    await quarantineInstaller(path);
    expect(await helper.validateDownloadedPath(path, info, file, logger)).toBeNull();
    // A cache miss sends the updater through its network download instead of returning corrupt bytes.
    await writeFile(path, original);
    await helper.setDownloadedFile(path, null, info, file, asset.name, false);
    await verifyInstaller(path, asset);
    expect(await readFile(path)).toEqual(original);
    expect(await helper.validateDownloadedPath(path, info, file, logger)).toBe(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
