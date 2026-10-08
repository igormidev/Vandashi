import type {
  AppEvent,
  ChatMessage,
  ChatSession,
  ClipHandoff,
  ModelInfo,
  ModelSelection,
} from '../../../domain/models';
import { normalizeTurnDurations } from '../../../domain/chat-turn-timing';

type ChatEvent = Extract<AppEvent, { type: 'chat' }>;
export function applyMessage(messages: ChatMessage[], event: ChatEvent): ChatMessage[] {
  const current = messages.find((message) => message.id === event.message.id);
  const next =
    current && event.delta ? { ...event.message, text: current.text + event.message.text } : event.message;
  const updated = current
    ? messages.map((message) => (message.id === next.id ? next : message))
    : [...messages, next];
  return normalizeTurnDurations(updated, [next]);
}
export function mergeSession(incoming: ChatSession, current?: ChatSession): ChatSession {
  if (!current)
    return { ...incoming, messages: normalizeTurnDurations(incoming.messages, incoming.messages) };
  const messages = incoming.messages.slice();
  for (const message of current.messages) {
    const index = messages.findIndex((entry) => entry.id === message.id);
    if (index < 0) messages.push(message);
    else {
      const incomingMessage = messages[index];
      if (!incomingMessage) continue;
      const currentTerminal =
        message.streaming === false || (message.activity && message.activity.status !== 'inProgress');
      const incomingActive =
        incomingMessage.streaming === true || incomingMessage.activity?.status === 'inProgress';
      if (currentTerminal && incomingActive && message.turnId === incomingMessage.turnId) {
        messages[index] = message;
        continue;
      }
      const terminal =
        incomingMessage.streaming === false ||
        (incomingMessage.activity && incomingMessage.activity.status !== 'inProgress');
      // Text length is not a lifecycle clock. Keep authoritative final metadata even
      // when completion replaces a longer partial output, while retaining live deltas.
      const { turnDurationMs, ...previous } = message;
      messages[index] = {
        ...previous,
        ...incomingMessage,
        ...(incomingMessage.turnDurationMs === undefined &&
        incomingMessage.turnId !== null &&
        message.turnId === incomingMessage.turnId &&
        turnDurationMs !== undefined
          ? { turnDurationMs }
          : {}),
        text:
          terminal || incomingMessage.text.length >= message.text.length
            ? incomingMessage.text
            : message.text,
        ...(message.streaming === false && incomingMessage.streaming === true ? { streaming: false } : {}),
      };
    }
  }
  return { ...incoming, messages: normalizeTurnDurations(messages, incoming.messages) };
}
export function selectedSession(sessions: ChatSession[], previous: string | null): string | null {
  return (
    sessions.find((session) => session.id === previous && session.open)?.id ??
    sessions.find((session) => session.open)?.id ??
    null
  );
}
export function validSelection(value: ModelSelection, models: ModelInfo[]): ModelSelection {
  const model =
    models.find((entry) => entry.id === value.model) ?? models.find((entry) => entry.isDefault) ?? models[0];
  if (!model) return value;
  return {
    model: model.id,
    reasoning: model.reasoning.includes(value.reasoning) ? value.reasoning : model.defaultReasoning,
    fast: value.fast && model.fast,
  };
}
export interface Draft {
  text: string;
  seed: string | null;
  pending: string | null;
  handoff?: ClipHandoff;
}
export function seedDraft(draft: Draft, seed: string | null, handoff?: ClipHandoff): Draft {
  // Selecting another tab hides the prepared target; it does not resolve its pending decision.
  if (seed === null) return draft;
  if (seed === draft.seed) return handoff && handoff !== draft.handoff ? { ...draft, handoff } : draft;
  const edited = !!draft.text.trim() && draft.text !== draft.seed;
  return {
    seed,
    text: edited ? draft.text : seed,
    pending: edited ? seed : null,
    ...(handoff ? { handoff } : {}),
  };
}
