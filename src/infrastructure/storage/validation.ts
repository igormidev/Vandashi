import type { z } from 'zod';
import { AppFault, DiagnosticError } from '../../domain/diagnostics';
import type { AppMessage } from '../../domain/messages';

/** Known persistence context is typed; parser and OS details remain unmodified external text. */
export function storageFault(message: AppMessage, error: unknown): DiagnosticError {
  return error instanceof DiagnosticError
    ? error
    : new AppFault(message, error instanceof Error ? error.message : String(error));
}

export function parseStorage<T>(schema: z.ZodType<T>, value: unknown, message: AppMessage): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppFault(message, result.error.message);
  return result.data;
}
