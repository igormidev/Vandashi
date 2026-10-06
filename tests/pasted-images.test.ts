import { mkdtemp, rm, writeFile, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ownedPastedImage, savePastedImage } from '../src/infrastructure/pasted-images';
import { PathPermissions } from '../src/desktop/path-permissions';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
it('restores only native owned pasted artifacts across a fresh permission instance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-paste-'));
  roots.push(root);
  const path = await savePastedImage(Buffer.from('normalized png bytes'), root);
  const permissions = new PathPermissions(
    () => Promise.reject(new Error('Outside registered workspaces')),
    undefined,
    (value) => ownedPastedImage(value, root),
  );
  expect(await permissions.file(path)).toBe(path);
  const unowned = join(root, 'secret.txt');
  await writeFile(unowned, 'private');
  await expect(permissions.file(unowned)).rejects.toThrow();
  await writeFile(path, 'replaced');
  await expect(permissions.file(path)).rejects.toThrow();
});
it('does not follow image or ownership record symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-paste-links-'));
  roots.push(root);
  const first = await savePastedImage(Buffer.from('first'), root);
  const second = await savePastedImage(Buffer.from('second'), root);
  await unlink(first);
  await symlink(second, first);
  await expect(ownedPastedImage(first, root)).rejects.toThrow();
  await unlink(second + '.owned.json');
  await symlink(first + '.owned.json', second + '.owned.json');
  await expect(ownedPastedImage(second, root)).rejects.toThrow();
});
