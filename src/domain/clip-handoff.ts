import { appMessageEnglish } from './messages';
import { parseAppMessage } from './diagnostics';
import type { ClipHandoff } from './models';

/** Provider/log fallback; the renderer supplies its current-locale message formatter. */
export function clipHandoffText(
  handoff: ClipHandoff,
  format: (message: ClipHandoff['message']) => string = appMessageEnglish,
): string {
  const instruction = format(handoff.message);
  return handoff.guidance ? `${instruction}\n\n${handoff.guidance}` : instruction;
}

/** Restore only the typed instruction, never arbitrary cached app messages. */
export function parseClipHandoff(value: unknown): ClipHandoff | undefined {
  if (!value || typeof value !== 'object' || !('message' in value) || !('guidance' in value)) return;
  const message = parseAppMessage(value.message);
  if (
    message?.id !== 'clipHandoff' ||
    typeof value.guidance !== 'string' ||
    value.guidance.length > 2_000_000
  )
    return;
  const { ratio, start, end } = message.params;
  if (
    (ratio !== '9:16' && ratio !== '1:1') ||
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start
  )
    return;
  return { message: { id: 'clipHandoff', params: { ratio, start, end } }, guidance: value.guidance };
}
