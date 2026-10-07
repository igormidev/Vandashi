import type { ChatItemActivity, ChatMessage } from '../../../domain/models';

type ObservedAgent = NonNullable<ChatItemActivity['agents']>[number];
export type AgentStates = Map<string, ObservedAgent>;

export type TimelineEntry =
  { kind: 'message'; message: ChatMessage } | { kind: 'activity'; id: string; messages: ChatMessage[] };

/** Preserve provider order and commentary boundaries; queued drafts live only in the composer. */
export function chatTimeline(messages: ChatMessage[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const message of messages) {
    if (message.pending === 'queued') continue;
    const activity =
      message.role === 'reasoning' ||
      message.role === 'tool' ||
      (message.role === 'error' && message.activity !== undefined);
    if (!activity || message.appMessage || message.diagnostic) {
      entries.push({ kind: 'message', message });
      continue;
    }
    const last = entries.at(-1);
    if (last?.kind === 'activity' && last.messages[0]?.turnId === message.turnId) last.messages.push(message);
    else entries.push({ kind: 'activity', id: message.id, messages: [message] });
  }
  return entries;
}

/** Never light an unfinished historical group while a different turn is working. */
export function currentTimelineTurn(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || message.pending === 'queued') continue;
    if (message.turnId) return message.turnId;
    if (message.role === 'user') return null;
  }
  return null;
}

/** Child states arrive in separate spawn/wait snapshots; the latest native report wins. */
export function agentStatesByTurn(messages: ChatMessage[]): Map<string, AgentStates> {
  const turns = new Map<string, AgentStates>();
  for (const message of messages) {
    if (!message.turnId || message.pending === 'queued') continue;
    const states = turns.get(message.turnId) ?? new Map<string, ObservedAgent>();
    for (const agent of message.activity?.agents ?? []) states.set(agent.id, agent);
    turns.set(message.turnId, states);
  }
  return turns;
}
export function liveActivityMessage(messages: ChatMessage[], states?: AgentStates): ChatMessage | undefined {
  return messages
    .slice()
    .reverse()
    .find((message) => isLiveActivity(message, states));
}
export function isLiveActivity(message: ChatMessage, states?: AgentStates): boolean {
  return (
    message.streaming === true ||
    message.activity?.status === 'inProgress' ||
    message.activity?.agents?.some((agent) => {
      const status = states?.get(agent.id)?.status ?? agent.status;
      return status === 'inProgress' || status === 'pending';
    }) === true
  );
}
