import { randomUUID } from 'node:crypto';
import { link, lstat, open, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitPort } from '../../domain/storage';
import type { ManualMutation } from './manual-mutation';
import { errorCode, hashText } from './files';

const legacyIgnore = '.vandashi-recovery/\n.vandashi-write-*\n.DS_Store\n';
/** This exact empty initial layout is the only unmarked library we can identify safely. */
export async function isLegacyPresetLibrary(root: string, git: GitPort): Promise<boolean> {
  const names = await readdir(root);
  if (names.some((name) => !['.git', '.gitignore', '.DS_Store', '.vandashi-recovery'].includes(name)))
    return false;
  for (const name of names) {
    const info = await lstat(join(root, name));
    if (info.isSymbolicLink()) return false;
    if (name === '.git' && !info.isDirectory()) return false;
  }
  if (!names.includes('.git') || !names.includes('.gitignore') || (await git.status(root)).dirty)
    return false;
  const history = await git.history(root, 0);
  if (
    history.hasMore ||
    history.commits.length !== 1 ||
    history.commits[0]?.title !== 'Create editing preset library'
  )
    return false;
  return (
    (await readFile(join(root, '.gitignore'), 'utf8')) === legacyIgnore &&
    (await git.readAt(root, await git.head(root), '.gitignore')) === legacyIgnore
  );
}

export async function identifyLegacyPresetLibrary(
  root: string,
  brandId: string,
  manual: ManualMutation,
): Promise<void> {
  const path = join(root, '.vandashi-presets.json');
  const content = JSON.stringify({ format: 'vandashi-presets-v1', brandId });
  await manual.run({
    key: JSON.stringify({ operation: 'identify-legacy-presets', root, brandId }),
    repositories: [root],
    paths: [path],
    commit: {
      title: 'Identify editing preset library',
      body: 'Preserve the existing preset history and bind its portable identity to this brand.',
    },
    mutate: async (receipt) => {
      const temporary = join(root, `.vandashi-write-${randomUUID()}`);
      const handle = await open(temporary, 'wx', 0o600);
      const owned = await handle.stat();
      try {
        await handle.writeFile(content);
        await handle.sync();
        await handle.close();
        receipt(path, hashText(content));
        try {
          await link(temporary, path);
        } catch (error) {
          receipt(path, null, false);
          throw error;
        }
      } finally {
        await handle.close().catch(() => undefined);
        const current = await lstat(temporary).catch((error: unknown) => {
          if (errorCode(error) === 'ENOENT') return null;
          throw error;
        });
        if (current?.ino === owned.ino && current.dev === owned.dev) await rm(temporary);
      }
    },
  });
}
