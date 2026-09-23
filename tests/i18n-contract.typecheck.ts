import type { TFunction } from 'i18next';
import type { AppMessage } from '../src/domain/messages';

/** Compiled by tsc; these examples do not execute or request translations. */
export function verifyCatalogTypes(t: TFunction): AppMessage[] {
  t('checkingTool', { tool: 'Codex' });
  t('chatInspectImage', { name: 'example.png' });
  // @ts-expect-error An unknown key must fail rather than quietly displaying its spelling.
  t('missingInterfaceLabel');
  // @ts-expect-error Required interpolation values must match the English contract.
  t('checkingTool', { wrongParameter: 'Codex' });
  // @ts-expect-error Domain diagnostics require named parameters even before transport.
  const missingParameter: AppMessage = { id: 'restoredDocument' };
  return [missingParameter, { id: 'restoredDocument', params: { name: 'script.md' } }];
}
