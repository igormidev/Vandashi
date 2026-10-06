import { mkdir, lstat, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { AppFault } from '../../domain/diagnostics';
import { containedPath } from './files';

export async function generationStage(root: string, trash?: (path: string) => Promise<void>) {
  const canonical = await realpath(root);
  const recovery = await containedPath(canonical, '.vandashi-recovery');
  await mkdir(recovery, { recursive: true });
  if ((await lstat(recovery)).isSymbolicLink()) throw new AppFault({ id: 'storageSymlinkOutside' });
  const path = await containedPath(recovery, `generation-${randomUUID()}`);
  await mkdir(path);
  const owned = await lstat(path);
  return {
    path,
    discard: async () => {
      const current = await lstat(path);
      if (
        (await realpath(path)) !== path ||
        current.isSymbolicLink() ||
        current.ino !== owned.ino ||
        current.dev !== owned.dev
      )
        throw new AppFault({ id: 'storageSymlinkOutside' });
      // Without a native recoverable Trash port, retain the evidence instead of deleting it.
      await trash?.(path);
    },
  };
}
