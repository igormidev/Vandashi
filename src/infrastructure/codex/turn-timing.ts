export { lastTurnAnswer } from '../../domain/chat-turn-timing';

export function verifiedTurnDuration(status: string | undefined, durationMs: unknown): number | undefined {
  return status === 'completed' &&
    typeof durationMs === 'number' &&
    Number.isSafeInteger(durationMs) &&
    durationMs >= 0
    ? durationMs
    : undefined;
}
