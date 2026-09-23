import { AppFault } from '../domain/diagnostics';
import { publishingUndoIssue } from '../domain/chat-undo-policy';
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
  const session = await store.getSession(id);
  const issue = publishingUndoIssue(session);
  if (issue) throw new AppFault(issue);
  const original = structuredClone(session);
  const checkpoint = session.checkpoints?.at(-1);
  if (!checkpoint?.threadId) throw new AppFault({ id: 'appUndoUnavailable' });
  if (!checkpoint.postHeads) throw new AppFault({ id: 'appUndoUnverified' });
  const current = { ...checkpoint.postHeads };
  const verify = async (expected: Record<string, string>) => {
    for (const repository of Object.keys(checkpoint.heads)) {
      if ((await git.status(repository)).dirty) throw new AppFault({ id: 'appSaveBeforeUndo' });
      if ((await git.head(repository)) !== expected[repository])
        throw new AppFault({ id: 'appUndoLaterChanges' });
    }
  };
  await verify(current);
  const branch = await agent.forkBefore(checkpoint.threadId, checkpoint.turnId);
  await verify(current);
  const restored = new Map<string, string>();
  try {
    for (const [repo, sha] of Object.entries(checkpoint.heads))
      restored.set(repo, await git.restore(repo, sha, current[repo]));
    await verify({ ...current, ...Object.fromEntries(restored) });
    session.threadId = branch.id;
    session.messages = session.messages.slice(0, checkpoint.messageCount);
    session.checkpoints?.pop();
    const previous = session.checkpoints?.at(-1);
    if (
      previous?.postHeads &&
      Object.entries(previous.postHeads).every(([repo, sha]) => checkpoint.heads[repo] === sha)
    )
      previous.postHeads = Object.fromEntries(
        Object.entries(previous.postHeads).map(([repo, sha]) => [repo, restored.get(repo) ?? sha]),
      );
    session.updatedAt = new Date().toISOString();
    await store.saveSession(session);
  } catch (error) {
    // Git restoration makes new commits. Keep the old conversation's guard in sync with compensated heads.
    const errors: unknown[] = [error];
    for (const [repo, ownedHead] of [...restored].reverse()) {
      const sha = current[repo];
      if (!sha || sha === ownedHead) continue;
      try {
        const recoveredHead = await git.restore(repo, sha, ownedHead);
        const latest = original.checkpoints?.at(-1);
        if (latest?.postHeads) latest.postHeads[repo] = recoveredHead;
      } catch (recoveryError) {
        errors.push(recoveryError);
      }
    }
    try {
      await store.saveSession(original);
    } catch (recoveryError) {
      errors.push(recoveryError);
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
