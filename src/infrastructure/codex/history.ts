import { AppFault } from '../../domain/diagnostics';
import type { AgentThread } from '../../domain/agent';
import type { ChatMessage } from '../../domain/models';
import type { RpcClient } from './transport';
import { itemMessage } from './events';
import { missingHistory, threadResponse, turnPage } from './schemas';
import { lastTurnAnswer, verifiedTurnDuration } from './turn-timing';

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
        const turnMessages: ChatMessage[] = [];
        for (const item of turn.items) {
          const message = itemMessage(item, turn.id);
          if (message) {
            // History carries observed provider settlement, unlike a persisted local cache.
            if (turn.status === 'inProgress') message.streaming = true;
            else if (turn.status === 'completed' || turn.status === 'failed' || turn.status === 'interrupted')
              message.streaming = false;
            else delete message.streaming;
            message.timestampKnown = false;
            thread.messages.push(message);
            turnMessages.push(message);
          }
        }
        const duration = verifiedTurnDuration(turn.status, turn.durationMs);
        const answer = duration === undefined ? undefined : lastTurnAnswer(turnMessages, turn.id);
        if (answer && duration !== undefined) answer.turnDurationMs = duration;
      }
      cursor = page.nextCursor;
      if (cursor) {
        if (cursors.has(cursor)) throw new AppFault({ id: 'codexHistoryCursorRepeated' });
        cursors.add(cursor);
      }
    } while (cursor);
    return thread;
  } catch (error) {
    return missingHistory(error);
  }
}
