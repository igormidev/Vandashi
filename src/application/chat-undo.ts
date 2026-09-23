import { AppFault } from '../domain/diagnostics';
import type { AgentPort } from '../domain/agent';
import type { AppEvent, ChatSession } from '../domain/models';
import type { GitPort, StoragePort } from '../domain/storage';

/** Restores the latest verified turn while retaining Git history and compensating partial failure. */
export async function undoChat(
  store: StoragePort,
  git: GitPort,
  agent: AgentPort,
  id: string,
  notify: (event: AppEvent) => void,
): Promise<ChatSession> {
  const heads = (repositories: string[]): Promise<Record<string, string>> =>
    Promise.all(
      repositories.map(async (repository): Promise<[string, string]> => [
        repository,
        await git.head(repository),
      ]),
    ).then(Object.fromEntries);
  const session = await store.getSession(id);
  const original = structuredClone(session);
  const checkpoint = session.checkpoints?.at(-1);
  if (!checkpoint?.threadId) throw new AppFault({ id: 'appUndoUnavailable' });
  if (!checkpoint.postHeads) throw new AppFault({ id: 'appUndoUnverified' });
  for (const repository of Object.keys(checkpoint.heads)) {
    if ((await git.status(repository)).dirty) throw new AppFault({ id: 'appSaveBeforeUndo' });
    if ((await git.head(repository)) !== checkpoint.postHeads[repository])
      throw new AppFault({ id: 'appUndoLaterChanges' });
  }
  const branch = await agent.forkBefore(checkpoint.threadId, checkpoint.turnId);
  const current = await heads(Object.keys(checkpoint.heads));
  try {
    for (const [repo, sha] of Object.entries(checkpoint.heads)) await git.restore(repo, sha);
    session.threadId = branch.id;
    session.messages = session.messages.slice(0, checkpoint.messageCount);
    session.checkpoints?.pop();
    const previous = session.checkpoints?.at(-1);
    if (
      previous?.postHeads &&
      Object.entries(previous.postHeads).every(([repo, sha]) => checkpoint.heads[repo] === sha)
    )
      previous.postHeads = await heads(Object.keys(previous.postHeads));
    session.updatedAt = new Date().toISOString();
    await store.saveSession(session);
  } catch (error) {
    // Git restoration makes new commits. Keep the old conversation's guard in sync with compensated heads.
    const errors: unknown[] = [error];
    for (const [repo, sha] of Object.entries(current)) {
      try {
        await git.restore(repo, sha);
      } catch (recoveryError) {
        errors.push(recoveryError);
      }
    }
    if (errors.length === 1) {
      const latest = original.checkpoints?.at(-1);
      if (latest) latest.postHeads = await heads(Object.keys(current));
      try {
        await store.saveSession(original);
      } catch (recoveryError) {
        errors.push(recoveryError);
      }
    }
    const failure = new AppFault(
      { id: 'appUndoFailed' },
      errors.map((cause) => (cause instanceof Error ? cause.message : String(cause))).join('\n'),
    );
    failure.cause = new AggregateError(errors);
    throw failure;
  }
  notify({ type: 'workspace-changed', scope: session.scope });
  return session;
}
