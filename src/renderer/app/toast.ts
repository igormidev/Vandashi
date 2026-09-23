import type { Diagnostic } from '../../domain/diagnostics';
import i18n from '../i18n';
import type { Translation } from '../locales/resources';
import { diagnosticText } from './diagnostics';

/** Keep app-owned labels and provider diagnostics distinct until the toast is displayed. */
export type Toast = Diagnostic | { kind: 'interface'; key: keyof Translation };

export function toastText(toast: Toast): string {
  return toast.kind === 'interface' ? i18n.t(toast.key) : diagnosticText(toast);
}
