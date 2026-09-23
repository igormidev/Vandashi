import { AppFault } from '../domain/diagnostics';
import type { AppMessage } from '../domain/messages';

/** Malformed URLs get stable guidance with the original URL parser detail retained separately. */
export function desktopUrl(value: string, message: AppMessage): URL {
  try {
    return new URL(value);
  } catch (error) {
    throw new AppFault(message, error instanceof Error ? error.message : String(error));
  }
}
