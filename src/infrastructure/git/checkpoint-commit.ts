import { lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppFault } from '../../domain/diagnostics';

interface CommitCommands {
  run(repository: string, args: string[], input?: string, indexFile?: string): Promise<string>;
  head(repository: string): Promise<string>;
}

/** Own both the exact parent and index installation; never return a later HEAD as our receipt. */
export async function commitCheckpoint(
  git: CommitCommands,
  repository: string,
  title: string,
  body: string,
  expectedHead: string,
): Promise<string> {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(expectedHead))
    throw new AppFault({ id: 'gitRestoreRevisionInvalid' });
  if ((await git.head(repository)) !== expectedHead) throw new AppFault({ id: 'appStudioCheckpointChanged' });
  const index = join(repository, '.git', 'index');
  const lockPath = `${index}.lock`;
  const lock = await open(lockPath, 'wx');
  const identity = await lock.stat();
  let temporary: string | undefined;
  let committed: string | undefined;
  let installed = false;
  try {
    const original = await readFile(index);
    const verify = async () => {
      if ((await git.head(repository)) !== expectedHead || !(await readFile(index)).equals(original))
        throw new AppFault({ id: 'appStudioCheckpointChanged' });
    };
    await verify();
    temporary = await mkdtemp(join(tmpdir(), 'vandashi-checkpoint-'));
    const stagedIndex = join(temporary, 'index');
    await writeFile(stagedIndex, original);
    await git.run(repository, ['add', '--all', '--', '.'], undefined, stagedIndex);
    const tree = (await git.run(repository, ['write-tree'], undefined, stagedIndex)).trim();
    await verify();
    committed = (
      await git.run(
        repository,
        ['commit-tree', tree, '-p', expectedHead],
        `${title.trim()}\n\n${body.trim()}\n`,
      )
    ).trim();
    await lock.writeFile(await readFile(stagedIndex));
    await verify();
    await git.run(repository, ['update-ref', 'HEAD', committed, expectedHead]);
    // Git respects index.lock. Also reject an external writer that bypassed that lock.
    if (!(await readFile(index)).equals(original)) throw new AppFault({ id: 'appStudioCheckpointChanged' });
    await lock.close();
    await rename(lockPath, index);
    installed = true;
    return committed;
  } catch (error) {
    if (committed && (await git.head(repository)) === committed) {
      // Only compensate our own ref update. CAS must preserve a later external commit.
      await git.run(repository, ['update-ref', 'HEAD', expectedHead, committed]).catch(() => undefined);
    }
    throw error;
  } finally {
    await lock.close();
    if (!installed) {
      const current = await lstat(lockPath).catch(() => null);
      if (current?.ino === identity.ino && current.dev === identity.dev) await rm(lockPath, { force: true });
    }
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
