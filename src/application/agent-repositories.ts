import type { Scope } from '../domain/models';
import type { GitPort, StoragePort } from '../domain/storage';
import { AppFault } from '../domain/diagnostics';
import type { Commits } from './commits';
import { repositoryHeads } from './turn-receipt';

/** A parent writable root includes all registered child repositories, even in a clip conversation. */
export async function prepareAgentScope(
  store: StoragePort,
  git: GitPort,
  commits: Commits,
  scope: Scope,
  beforeSync?: () => void,
): Promise<{ repositories: string[]; sharedScopes: Scope[]; heads: Record<string, string>; cwd: string }> {
  const { repositories: paths, sharedScopes, cwd } = await store.discoverAgentScope(scope);
  for (const repository of paths)
    if ((await git.status(repository)).dirty) throw new AppFault({ id: 'appSaveBeforeAi' });
  // Settle derived copies only after rejecting all pre-existing manual changes.
  beforeSync?.();
  await commits.syncBaseline(paths, sharedScopes);
  return {
    repositories: paths,
    sharedScopes,
    heads: await repositoryHeads(git, paths),
    cwd,
  };
}
