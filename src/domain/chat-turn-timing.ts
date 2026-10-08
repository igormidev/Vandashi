import type { ChatMessage } from './models';

function providerAnswer(message: ChatMessage): boolean {
  return (
    message.turnId !== null &&
    message.role === 'assistant' &&
    message.phase !== 'commentary' &&
    !message.appMessage
  );
}

/** The native reducer may select a live answer only when it observes actual turn settlement. */
export function lastTurnAnswer(messages: readonly ChatMessage[], turnId: string): ChatMessage | undefined {
  return [...messages].reverse().find((message) => message.turnId === turnId && providerAnswer(message));
}

/** Keep one observed header per turn. Untimed rows cannot acquire cached timing or completion. */
export function normalizeTurnDurations(
  messages: ChatMessage[],
  observed: readonly ChatMessage[] = [],
): ChatMessage[] {
  const owners = new Map<string, { id: string; duration: number }>();
  const presentAnswers = new Map<string, Set<string>>();
  for (const message of messages) {
    if (message.turnId === null || !providerAnswer(message) || message.streaming === true) continue;
    const ids = presentAnswers.get(message.turnId) ?? new Set<string>();
    ids.add(message.id);
    presentAnswers.set(message.turnId, ids);
  }
  const collect = (entries: readonly ChatMessage[]) => {
    for (const message of entries) {
      const duration = message.turnDurationMs;
      if (
        message.turnId === null ||
        !providerAnswer(message) ||
        message.streaming === true ||
        duration === undefined ||
        !Number.isSafeInteger(duration) ||
        duration < 0 ||
        !presentAnswers.get(message.turnId)?.has(message.id)
      )
        continue;
      owners.set(message.turnId, { id: message.id, duration });
    }
  };
  collect(messages);
  collect(observed);
  return messages.map((message) => {
    const owner = message.turnId === null ? undefined : owners.get(message.turnId);
    const duration =
      owner?.id === message.id && providerAnswer(message) && message.streaming !== true
        ? owner.duration
        : undefined;
    if (message.turnDurationMs === duration) return message;
    const content = { ...message };
    delete content.turnDurationMs;
    return duration === undefined ? content : { ...content, turnDurationMs: duration };
  });
}
