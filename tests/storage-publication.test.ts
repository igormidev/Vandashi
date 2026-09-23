import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { publishImportedDirectory } from '../src/infrastructure/storage/import-publication';

const roots: string[] = [];
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vandashi-publication-')));
  roots.push(root);
  const staging = join(root, 'staging');
  const destination = join(root, 'destination');
  await Promise.all([mkdir(staging), mkdir(destination)]);
  await writeFile(join(staging, '.vandashi.yml'), 'Validated manifest');
  await writeFile(join(staging, 'script.md'), 'Prepared content');
  return { root, staging, destination };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it('does not overwrite an external file or expose its project manifest after a collision', async () => {
  const { staging, destination } = await setup();
  await writeFile(join(destination, 'script.md'), 'Keep external content');
  await expect(publishImportedDirectory(staging, destination)).rejects.toThrow();
  expect(await readFile(join(destination, 'script.md'), 'utf8')).toBe('Keep external content');
  expect(await readdir(destination)).not.toContain('.vandashi.yml');
});

it('refuses existing directories and escaping symbolic entries without adopting them', async () => {
  const { staging, destination, root } = await setup();
  await mkdir(join(staging, 'video_assets'));
  await mkdir(join(destination, 'video_assets'));
  await writeFile(join(destination, 'video_assets', 'external.txt'), 'Preserve this asset');
  await expect(publishImportedDirectory(staging, destination)).rejects.toThrow();
  expect(await readFile(join(destination, 'video_assets', 'external.txt'), 'utf8')).toBe(
    'Preserve this asset',
  );
  expect(await readdir(destination)).not.toContain('.vandashi.yml');
  const other = join(root, 'other');
  await mkdir(other);
  await symlink(other, join(staging, 'escape'));
  await expect(publishImportedDirectory(staging, destination)).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'storageImportUnexpectedEntry' } },
  });
  expect(await readdir(other)).toEqual([]);
});

it('rejects a replaced destination reservation without copying into the replacement', async () => {
  const { root, staging, destination } = await setup();
  const reserved = await lstat(destination);
  await rename(destination, join(root, 'original-reservation'));
  await mkdir(destination);
  await writeFile(join(destination, 'external.txt'), 'Replacement files');
  await expect(publishImportedDirectory(staging, destination, reserved)).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'storageImportReservationChanged' } },
  });
  expect(await readdir(destination)).toEqual(['external.txt']);
  expect(await readFile(join(destination, 'external.txt'), 'utf8')).toBe('Replacement files');
});
