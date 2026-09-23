import { AppFault } from '../../domain/diagnostics';
import type { GitStatus } from '../../domain/storage';

interface RestoreCommands {
  run(repository: string, args: string[], input?: string): Promise<string>;
  head(repository: string): Promise<string>;
  status(repository: string): Promise<GitStatus>;
}
const validRevision = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

/** Two-tree checkout preserves concurrent dirty writes; compare-and-swap preserves later commits. */
export async function restoreCheckpoint(
  git: RestoreCommands,
  repository: string,
  revision: string,
  expectedHead?: string,
): Promise<string> {
  if (!validRevision.test(revision) || (expectedHead !== undefined && !validRevision.test(expectedHead)))
    throw new AppFault({ id: 'gitRestoreRevisionInvalid' });
  if ((await git.status(repository)).dirty) throw new AppFault({ id: 'gitRestoreDirty' });
  const backup = await git.head(repository);
  const verify = async () => {
    if ((await git.head(repository)) !== (expectedHead ?? backup))
      throw new AppFault({ id: 'appUndoLaterChanges' });
    if ((await git.status(repository)).dirty) throw new AppFault({ id: 'gitRestoreDirty' });
  };
  await verify();
  const tree = (await git.run(repository, ['rev-parse', '--verify', `${revision}^{tree}`])).trim();
  if (tree === (await git.run(repository, ['rev-parse', '--verify', `${backup}^{tree}`])).trim()) {
    await verify();
    return backup;
  }
  await git.run(repository, ['update-ref', `refs/vandashi/backups/${crypto.randomUUID()}`, backup]);
  const restored = (
    await git.run(
      repository,
      ['commit-tree', tree, '-p', backup],
      `Restore workspace checkpoint\n\nRestore tracked content from ${revision}. The previous state remains in Git history and a backup reference.\n`,
    )
  ).trim();
  await verify();
  try {
    // Unlike forced restore, a two-tree merge refuses dirty tracked files that it would overwrite.
    await git.run(repository, ['read-tree', '-m', '-u', backup, restored]);
    await git.run(repository, ['update-ref', 'HEAD', restored, backup]);
    return restored;
  } catch (error) {
    // Compensate only the exact index/worktree we wrote, never a later external commit or edit.
    if (
      (await git.head(repository)) === backup &&
      (await git.run(repository, ['write-tree'])).trim() === tree &&
      !(await git.run(repository, ['diff', '--name-only', '-z'])).length
    ) {
      await git.run(repository, ['read-tree', '-m', '-u', restored, backup]);
    }
    throw error;
  }
}
