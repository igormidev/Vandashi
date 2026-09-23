import { appMessageEnglish, appMessagesEn } from './messages';
import type { AppMessage } from './messages';

export type Diagnostic =
  { kind: 'app'; message: AppMessage; externalDetail?: string } | { kind: 'external'; text: string };

export class DiagnosticError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnosticEnglish(diagnostic));
    this.name = 'DiagnosticError';
  }
}

export class AppFault extends DiagnosticError {
  constructor(message: AppMessage, externalDetail?: string) {
    super({
      kind: 'app',
      message,
      ...(externalDetail === undefined ? {} : { externalDetail: bounded(externalDetail) }),
    });
    this.name = 'AppFault';
  }
}

export function diagnosticEnglish(diagnostic: Diagnostic): string {
  if (diagnostic.kind === 'external') return diagnostic.text;
  const text = appMessageEnglish(diagnostic.message);
  return diagnostic.externalDetail ? `${text}\n${diagnostic.externalDetail}` : text;
}

const textLimit = 32_768;
const bounded = (value: string): string => value.slice(0, textLimit);
const parameterNames = (template: string): string[] => [
  ...new Set(Array.from(template.matchAll(/\{\{(\w+)\}\}/g), (entry) => entry[1] ?? '')),
];
const invalid = (): Diagnostic => ({ kind: 'app', message: { id: 'invalidDiagnostic' } });
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

export function parseAppMessage(value: unknown): AppMessage | null {
  if (
    !record(value) ||
    !keysAre(value, ['id', 'params']) ||
    typeof value.id !== 'string' ||
    !Object.hasOwn(appMessagesEn, value.id)
  )
    return null;
  const template = appMessagesEn[value.id as keyof typeof appMessagesEn];
  const expected = parameterNames(template);
  if (expected.length === 0) return Object.hasOwn(value, 'params') ? null : (value as AppMessage);
  if (!record(value.params) || Object.keys(value.params).length !== expected.length) return null;
  for (const key of expected) {
    if (!key || !Object.hasOwn(value.params, key)) return null;
    const parameter = value.params[key];
    if (!(
      (typeof parameter === 'string' && parameter.length <= 32_768) ||
      (typeof parameter === 'number' && Number.isFinite(parameter))
    ))
      return null;
  }
  return value as AppMessage;
}

export function parseDiagnostic(value: unknown): Diagnostic | null {
  if (!record(value)) return null;
  if (value.kind === 'external')
    return keysAre(value, ['kind', 'text']) && typeof value.text === 'string' && value.text.length <= 32_768
      ? { kind: 'external', text: value.text }
      : null;
  if (value.kind !== 'app' || !keysAre(value, ['kind', 'message', 'externalDetail'])) return null;
  const message = parseAppMessage(value.message);
  if (!message) return null;
  if (value.externalDetail === undefined) return { kind: 'app', message };
  return typeof value.externalDetail === 'string' && value.externalDetail.length <= 32_768
    ? { kind: 'app', message, externalDetail: value.externalDetail }
    : null;
}

/** Never classify producer prose by its spelling, even if it resembles the wire marker. */
export function diagnosticFromError(error: unknown): Diagnostic {
  if (error instanceof DiagnosticError) return parseDiagnostic(error.diagnostic) ?? invalid();
  return { kind: 'external', text: bounded(error instanceof Error ? error.message : String(error)) };
}

const wirePrefix = 'VANDASHI_DIAGNOSTIC_V1:';
// A UTF-16 character can expand to six JSON characters (for example an ESC control).
// Derive the wire ceiling from every accepted descriptor, including all parameters and detail.
export const diagnosticWireLimit =
  wirePrefix.length +
  Math.max(
    JSON.stringify({ kind: 'external', text: '' }).length + 6 * textLimit,
    ...Object.entries(appMessagesEn).map(([id, template]) => {
      const names = parameterNames(template);
      const message = {
        id,
        ...(names.length ? { params: Object.fromEntries(names.map((name) => [name, ''])) } : {}),
      };
      return (
        JSON.stringify({ kind: 'app', message, externalDetail: '' }).length +
        6 * textLimit * (names.length + 1)
      );
    }),
  );
export function encodeDiagnostic(diagnostic: Diagnostic): string {
  return `${wirePrefix}${JSON.stringify(parseDiagnostic(diagnostic) ?? invalid())}`;
}

/** Decode once at the renderer edge after Electron has copied Error.message. */
export function diagnosticFromBridge(error: unknown): Diagnostic {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.startsWith(wirePrefix))
    return message.startsWith('VANDASHI_DIAGNOSTIC_') ? invalid() : diagnosticFromError(error);
  if (message.length > diagnosticWireLimit) return invalid();
  try {
    return parseDiagnostic(JSON.parse(message.slice(wirePrefix.length)) as unknown) ?? invalid();
  } catch {
    return invalid();
  }
}

export interface FailureEnvelope {
  __vandashiFailure: 'v1';
  diagnostic: Diagnostic;
}
export function failureEnvelope(error: unknown): FailureEnvelope {
  return { __vandashiFailure: 'v1', diagnostic: diagnosticFromError(error) };
}
export function envelopeDiagnostic(value: unknown): Diagnostic | null {
  if (!record(value) || !Object.hasOwn(value, '__vandashiFailure')) return null;
  if (value.__vandashiFailure !== 'v1' || !keysAre(value, ['__vandashiFailure', 'diagnostic']))
    return invalid();
  return parseDiagnostic(value.diagnostic) ?? invalid();
}
