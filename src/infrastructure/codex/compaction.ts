import type { AgentEvent } from '../../domain/agent';
import { AgentError } from '../../domain/agent';
import { EventReducer } from './events';
import { object, string, turnSchema } from './schemas';
import type { RpcClient } from './transport';

/** The RPC acknowledges a start; only the owned native turn completion releases the operation. */
export async function compactContext(
  client: RpcClient,
  threadId: string,
  onEvent: (event: AgentEvent) => void,
  onTurn: (turnId: string) => void,
  timeoutMs = 600_000,
): Promise<void> {
  const reducer = new EventReducer();
  const owned = { turnId: null as string | null };
  let resolve: (() => void) | undefined;
  let reject: ((error: Error) => void) | undefined;
  const completion = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  void completion.catch(() => undefined);
  const timer = setTimeout(() => {
    reject?.(new AgentError('timeout', { id: 'codexProgressTimeout' }));
  }, timeoutMs);
  const unsubscribe = client.subscribe((event) => {
    const data = object(event.params);
    if (data['threadId'] !== threadId) return;
    if (event.method === 'turn/started') {
      const id = string(object(data['turn'])['id']);
      if (!id || owned.turnId) return;
      owned.turnId = id;
      onTurn(id);
      return;
    }
    const turnId = owned.turnId;
    if (!turnId || (typeof data['turnId'] === 'string' && data['turnId'] !== turnId)) return;
    if (event.method === 'turn/completed') {
      const parsed = turnSchema.safeParse(data['turn']);
      if (!parsed.success || parsed.data.id !== turnId) return;
      const turn = parsed.data;
      for (const item of turn.items) {
        const message = reducer.reduce({ method: 'item/completed', params: { threadId, turnId, item } });
        if (message?.type === 'message') onEvent(message);
      }
      const status = turn.status === 'completed' || turn.status === 'interrupted' ? turn.status : 'failed';
      for (const message of reducer.settle(turnId, status)) onEvent(message);
      if (status === 'completed') resolve?.();
      else
        reject?.(
          new AgentError(
            'protocol',
            { id: status === 'interrupted' ? 'appOperationInterrupted' : 'appOperationFailed' },
            turn.error?.message,
          ),
        );
      return;
    }
    const normalized = reducer.reduce(event);
    if (normalized?.type === 'message') onEvent(normalized);
  });
  const unsubscribeFailure = client.onFailure((error) => {
    reject?.(error);
  });
  try {
    await client.request('thread/compact/start', { threadId });
    await completion;
  } catch (error) {
    // Start may already have been accepted. Wait for actual process shutdown before releasing the lease.
    await client.close();
    if (owned.turnId) for (const message of reducer.settle(owned.turnId, 'failed')) onEvent(message);
    throw error;
  } finally {
    clearTimeout(timer);
    unsubscribe();
    unsubscribeFailure();
  }
}
