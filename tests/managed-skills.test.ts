import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { installManagedSkills } from '../src/infrastructure/codex/managed-skills';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
it('installs idempotently and preserves locally modified skill content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-skills-'));
  roots.push(root);
  const first = await installManagedSkills(root);
  expect(await installManagedSkills(root)).toEqual(first);
  const file = first['vandashi-create-assets'];
  if (!file) throw new Error('Missing managed skill');
  await writeFile(file, 'user changes');
  await expect(installManagedSkills(root)).rejects.toThrow();
  expect(await readFile(file, 'utf8')).toBe('user changes');
});
it('rejects a symlinked skill directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-skills-'));
  roots.push(root);
  const outside = await mkdtemp(join(tmpdir(), 'vandashi-outside-'));
  roots.push(outside);
  await symlink(outside, join(root, 'skills'));
  await expect(installManagedSkills(root)).rejects.toThrow();
});
