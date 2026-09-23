import type { AppEvent, ChatMessage, ChatSession, ModelInfo, ModelSelection } from '../../../domain/models';

type ChatEvent = Extract<AppEvent, { type: 'chat' }>;
export function applyMessage(messages: ChatMessage[], event: ChatEvent): ChatMessage[] {
  const current = messages.find((message) => message.id === event.message.id);
  const next =
    current && event.delta ? { ...event.message, text: current.text + event.message.text } : event.message;
  return current ? messages.map((message) => (message.id === next.id ? next : message)) : [...messages, next];
}
export function mergeSession(incoming: ChatSession, current?: ChatSession): ChatSession {
  if (!current) return incoming;
  const messages = incoming.messages.slice();
  for (const message of current.messages) {
    const index = messages.findIndex((entry) => entry.id === message.id);
    if (index < 0) messages.push(message);
    else if ((messages[index]?.text.length ?? 0) <= message.text.length) messages[index] = message;
  }
  return { ...incoming, messages };
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
}
export function seedDraft(draft: Draft, seed: string | null): Draft {
  // Selecting another tab hides the prepared target; it does not resolve its pending decision.
  if (seed === null || seed === draft.seed) return draft;
  const edited = !!draft.text.trim() && draft.text !== draft.seed;
  return { seed, text: edited ? draft.text : seed, pending: edited ? seed : null };
}
