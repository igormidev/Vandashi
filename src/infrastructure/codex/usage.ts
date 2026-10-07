import { z } from 'zod';
import type { ChatContextUsage, ChatUsage, ChatUsageWindow } from '../../domain/chat-usage';
import type { RpcClient, RpcNotification } from './transport';
import { object } from './schemas';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const usageUpdate = z.object({
  threadId: z.string().min(1),
  tokenUsage: z.object({
    last: z.object({ totalTokens: count }),
    total: z.object({ totalTokens: count }).nullish(),
    modelContextWindow: count.nullish(),
  }),
});
const windowSchema = z.object({
  usedPercent: z.number(),
  windowDurationMins: z.number().positive().nullish(),
  resetsAt: z.number().positive().nullish(),
});

export function contextObservation(
  event: RpcNotification,
): { threadId: string; context: ChatContextUsage } | null {
  if (event.method !== 'thread/tokenUsage/updated') return null;
  const parsed = usageUpdate.safeParse(event.params);
  if (!parsed.success) return null;
  const { threadId, tokenUsage } = parsed.data;
  return {
    threadId,
    context: {
      usedTokens: tokenUsage.last.totalTokens,
      maxTokens: tokenUsage.modelContextWindow || null,
      totalTokens: tokenUsage.total?.totalTokens ?? null,
      observedAt: new Date().toISOString(),
    },
  };
}

export function accountObservation(value: unknown): ChatUsage['account'] {
  const response = object(value);
  const buckets = object(response['rateLimitsByLimitId']);
  const snapshot = object(buckets['codex'] ?? response['rateLimits']);
  const windows: ChatUsageWindow[] = [];
  if (!snapshot['limitId'] || snapshot['limitId'] === 'codex') {
    for (const id of ['primary', 'secondary'] as const) {
      const parsed = windowSchema.safeParse(snapshot[id]);
      if (!parsed.success) continue;
      const window = parsed.data;
      const reset = window.resetsAt ? new Date(window.resetsAt * 1000) : null;
      windows.push({
        id,
        usedPercent: Math.max(0, Math.min(100, window.usedPercent)),
        durationMinutes: window.windowDurationMins ?? null,
        resetsAt: reset && Number.isFinite(reset.getTime()) ? reset.toISOString() : null,
      });
    }
  }
  return { available: windows.length > 0, windows, checkedAt: new Date().toISOString() };
}

/** Coalesce in-flight reads, but never substitute yesterday's snapshot after a failed refresh. */
export class CodexUsage {
  private readonly contexts = new Map<string, ChatContextUsage>();
  private pending: Promise<ChatUsage['account']> | null = null;
  constructor(private readonly changed: (threadId: string, context: ChatContextUsage) => void) {}
  observe(event: RpcNotification): void {
    const observation = contextObservation(event);
    if (!observation) return;
    this.contexts.set(observation.threadId, observation.context);
    this.changed(observation.threadId, structuredClone(observation.context));
  }
  clear(): void {
    this.contexts.clear();
    this.pending = null;
  }
  async read(client: RpcClient, threadId: string | null): Promise<ChatUsage> {
    this.pending ??= client
      .request('account/rateLimits/read', {})
      .then(accountObservation, () => accountObservation(null));
    const pending = this.pending;
    try {
      const account = await pending;
      return { context: threadId ? structuredClone(this.contexts.get(threadId) ?? null) : null, account };
    } finally {
      if (this.pending === pending) this.pending = null;
    }
  }
}
