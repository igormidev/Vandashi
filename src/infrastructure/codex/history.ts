import type { AgentThread } from '../../domain/agent';
import type { RpcClient } from './transport';
import { itemMessage } from './events';
import { missingHistory, threadResponse, turnPage } from './schemas';

export async function readHistory(client: RpcClient, threadId: string): Promise<AgentThread> {
  try {
    const response = threadResponse.parse(
      await client.request('thread/read', { threadId, includeTurns: false }),
    );
    const thread: AgentThread = { id: response.thread.id, messages: [], turnIds: [] };
    let cursor: string | null = null;
    const cursors = new Set<string>();
    do {
      const page = turnPage.parse(
        await client.request('thread/turns/list', {
          threadId,
          cursor,
          limit: 100,
          sortDirection: 'asc',
          itemsView: 'full',
        }),
      );
      for (const turn of page.data) {
        thread.turnIds.push(turn.id);
        for (const item of turn.items) {
          const message = itemMessage(item, turn.id);
          if (message) thread.messages.push(message);
        }
      }
      cursor = page.nextCursor;
      if (cursor) {
        if (cursors.has(cursor)) throw new Error('Codex history pagination repeated a cursor.');
        cursors.add(cursor);
      }
    } while (cursor);
    return thread;
  } catch (error) {
    return missingHistory(error);
  }
}
