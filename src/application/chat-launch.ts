import { diagnosticFromError } from '../domain/diagnostics';
import type { AppEvent } from '../domain/models';
import type { Prepared } from './chat-types';

export function launchChat(
  prepared: Prepared,
  execute: (accepted: () => void, rejected: (error: unknown) => void) => Promise<boolean>,
  release: () => void,
  notify: (event: AppEvent) => void,
  settled?: (success: boolean) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let success = false;
    void execute(resolve, reject)
      .then((result) => {
        success = result;
      })
      .catch((error: unknown) => {
        notify({ type: 'workspace-changed', scope: prepared.session.scope });
        reject(error instanceof Error ? error : new Error(String(error)));
        notify({
          type: 'notice',
          code: 'save-failed',
          detail: String(error),
          diagnostic: diagnosticFromError(error),
        });
      })
      .finally(() => {
        release();
        notify({ type: 'chat-settled', scope: prepared.session.scope, sessionId: prepared.session.id });
        settled?.(success);
      });
  });
}
