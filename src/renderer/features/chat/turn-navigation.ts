import type { ChatMessage } from '../../../domain/models';

export interface ChatTurnSummary {
  messageId: string;
  messageIndex: number;
  turnId: string;
  number: number;
  userText: string;
  assistantText: string;
}

export function isAcceptedUserTurn(message: ChatMessage): boolean {
  return message.role === 'user' && !message.pending && Boolean(message.turnId);
}

/** Provider-owned user boundaries, with the last answer from that exact turn. */
export function chatTurnSummaries(messages: readonly ChatMessage[]): ChatTurnSummary[] {
  const turns: ChatTurnSummary[] = [];
  let current: ChatTurnSummary | undefined;
  let turnId: string | null = null;
  for (const [messageIndex, message] of messages.entries()) {
    if (message.role === 'user') {
      current = undefined;
      turnId = null;
      if (isAcceptedUserTurn(message) && message.turnId) {
        current = {
          messageId: message.id,
          messageIndex,
          turnId: message.turnId,
          number: turns.length + 1,
          userText: message.userText ?? message.text,
          assistantText: '',
        };
        turnId = message.turnId;
        turns.push(current);
      }
    } else if (
      current &&
      message.turnId === turnId &&
      message.role === 'assistant' &&
      message.phase !== 'commentary' &&
      !message.pending &&
      !message.appMessage &&
      !message.diagnostic
    ) {
      current.assistantText = message.text;
    }
  }
  return turns;
}

export function filterChatTurns(turns: readonly ChatTurnSummary[], query: string): ChatTurnSummary[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return [...turns];
  return turns.filter((turn) => {
    const content = `${turn.userText}\n${turn.assistantText}`.toLocaleLowerCase();
    return words.every((word) => content.includes(word));
  });
}

export function turnAtRow(
  turns: readonly ChatTurnSummary[],
  messages: readonly ChatMessage[],
  rowId: string | null,
): string | null {
  if (!rowId) return null;
  const row = messages.findIndex((message) => message.id === rowId);
  if (row < 0 || messages[row]?.pending) return null;
  for (let index = row; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') continue;
    const turn = turns.find((entry) => entry.messageIndex === index);
    return turn && turn.turnId === messages[row]?.turnId ? turn.messageId : null;
  }
  return null;
}

export function turnPreview(text: string): string {
  const preview = text.replace(/\s+/gu, ' ').trim();
  return preview.length > 180 ? `${preview.slice(0, 179)}…` : preview;
}
