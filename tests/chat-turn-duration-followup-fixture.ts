import type { AgentEvent } from '../src/domain/agent';
import type { ChatMessage, ChatSession } from '../src/domain/models';
import type { EventReducer } from '../src/infrastructure/codex/events';
import type { RpcClient, RpcNotification } from '../src/infrastructure/codex/transport';

export function message(id: string, turnId = 'turn', extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    turnId,
    role: 'assistant',
    text: id,
    files: [],
    createdAt: '2026-10-08T10:00:00Z',
    phase: 'final_answer',
    ...extra,
  };
}
export function session(messages: ChatMessage[]): ChatSession {
  return {
    id: 'session',
    scope: { brandId: 'brand', videoId: null, clipId: null },
    topic: 'brand',
    title: 'Brand',
    threadId: 'thread',
    messages,
    open: true,
    updatedAt: '2026-10-08T10:00:00Z',
  };
}
export function messages(events: AgentEvent[]): ChatMessage[] {
  return events.flatMap((event) => (event.type === 'message' ? [event.message] : []));
}
export class TimingClient implements RpcClient {
  readonly listeners = new Set<(event: RpcNotification) => void>();
  constructor(readonly handler: (method: string, params: unknown) => unknown) {}
  request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve) => {
      resolve(this.handler(method, params));
    });
  }
  subscribe(listener: (event: RpcNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onFailure(): () => void {
    return () => undefined;
  }
  async close(): Promise<void> {}
  emit(method: string, params: unknown): void {
    for (const listener of this.listeners) listener({ method, params });
  }
}
export function item(
  reducer: EventReducer,
  id: string,
  type: string,
  properties: Record<string, unknown> = {},
): void {
  reducer.reduce({
    method: 'item/completed',
    params: { turnId: 'turn', item: { id, type, text: id, ...properties } },
  });
}
