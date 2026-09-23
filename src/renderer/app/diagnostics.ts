import { diagnosticFromBridge, parseAppMessage, parseDiagnostic } from '../../domain/diagnostics';
import type { Diagnostic } from '../../domain/diagnostics';
import type { AppMessage } from '../../domain/messages';
import i18n from '../i18n';

export function messageText(message: AppMessage): string {
  const valid = parseAppMessage(message) ?? { id: 'invalidDiagnostic' };
  return i18n.t(valid.id, { ns: 'messages', ...('params' in valid ? valid.params : {}) });
}

export function diagnosticText(diagnostic: Diagnostic): string {
  const valid = parseDiagnostic(diagnostic);
  if (!valid) return messageText({ id: 'invalidDiagnostic' });
  if (valid.kind === 'external') return valid.text;
  const text = messageText(valid.message);
  return valid.externalDetail ? `${text}\n${valid.externalDetail}` : text;
}

export function errorText(error: unknown): string {
  return diagnosticText(diagnosticFromBridge(error));
}
