import { mkdtemp, rm, readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { generationStage } from '../src/infrastructure/storage/generation-stage';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
it('keeps intermediate evidence without Trash and moves only its owned generation directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-stage-'));
  roots.push(root);
  const retained = await generationStage(root);
  await writeFile(join(retained.path, 'source.txt'), 'recoverable');
  await retained.discard();
  expect(await readFile(join(retained.path, 'source.txt'), 'utf8')).toBe('recoverable');
  const calls: string[] = [];
  const owned = await generationStage(root, (path) => {
    calls.push(path);
    return Promise.resolve();
  });
  await owned.discard();
  expect(calls).toEqual([owned.path]);
});
it('preserves a concurrently replaced directory rather than sending it to Trash', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-stage-replaced-'));
  roots.push(root);
  let trashed = false;
  const owned = await generationStage(root, () => {
    trashed = true;
    return Promise.resolve();
  });
  await rename(owned.path, owned.path + '-original');
  await mkdir(owned.path);
  await writeFile(join(owned.path, 'external.txt'), 'external work');
  await expect(owned.discard()).rejects.toThrow();
  expect(trashed).toBe(false);
  expect(await readFile(join(owned.path, 'external.txt'), 'utf8')).toBe('external work');
});
