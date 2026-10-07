import { AgentError } from '../../domain/agent';
import type { AgentThread } from '../../domain/agent';
import { readHistory } from './history';
import { threadResponse } from './schemas';
import type { RpcClient } from './transport';

/** Codex forks THROUGH lastTurnId. A before-first fork needs a revert on the new thread. */
export async function forkHistory(
  client: RpcClient,
  threadId: string,
  turnId: string,
  boundary: 'before' | 'through',
): Promise<AgentThread> {
  const source = await readHistory(client, threadId);
  const index = source.turnIds.indexOf(turnId);
  if (index < 0) throw new AgentError('protocol', { id: 'untrustedRequest' });
  const count = index + (boundary === 'through' ? 1 : 0);
  const lastTurnId = source.turnIds[count - 1];
  const response = threadResponse.parse(
    await client.request('thread/fork', {
      threadId,
      ...(lastTurnId ? { lastTurnId } : {}),
      excludeTurns: true,
    }),
  );
  if (!lastTurnId)
    await client.request('thread/revert', { threadId: response.thread.id, beforeTurnId: turnId });
  const fork = await readHistory(client, response.thread.id);
  const expected = source.turnIds.slice(0, count);
  if (fork.id === threadId || JSON.stringify(fork.turnIds) !== JSON.stringify(expected))
    throw new AgentError('protocol', { id: 'codexDifferentThread' });
  return fork;
}
