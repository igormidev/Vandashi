import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QueuedChat } from '../../../domain/models';
import { useApp } from '../../app/store';
import { PendingLabel } from '../../shared/ui';
import { diagnosticFromBridge, type Diagnostic } from '../../../domain/diagnostics';
import { diagnosticText } from '../../app/diagnostics';

export function QueuedMessages({
  sessionId,
  canRestore,
  restore,
}: {
  sessionId: string;
  canRestore: boolean;
  restore: (entry: QueuedChat) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { api, run } = useApp();
  const [entries, setEntries] = useState<QueuedChat[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<Diagnostic | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const remove = api.onEvent((event) => {
      if (event.type === 'chat-queue' && event.sessionId === sessionId) {
        revision++;
        setEntries(event.entries);
        setFailure(null);
        setLoading(false);
      }
    });
    void api.queuedChats(sessionId).then(
      (value) => {
        if (active && revision === 0) {
          setEntries(value);
          setLoading(false);
        }
      },
      (error: unknown) => {
        if (active && revision === 0) {
          setFailure(diagnosticFromBridge(error));
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
      remove();
    };
  }, [api, sessionId, attempt]);
  return (
    <div className="queued-messages" aria-busy={loading}>
      {loading && <PendingLabel label={t('loading')} />}
      {failure && (
        <div role="alert">
          <span>{diagnosticText(failure)}</span>
          <button
            type="button"
            className="button compact"
            onClick={() => {
              setLoading(true);
              setFailure(null);
              setAttempt(attempt + 1);
            }}
          >
            {t('retry')}
          </button>
        </div>
      )}
      {entries.map((entry) => (
        <div className="queued-message" key={entry.id}>
          <span>{t(entry.failed ? 'queueHeld' : 'queued')}</span>
          <span className="queued-text">{entry.request.text}</span>
          {entry.failed && (
            <button
              type="button"
              className="button compact"
              disabled={!canRestore || pending !== null}
              onClick={() => {
                setPending(entry.id);
                void run(() => restore(entry)).finally(() => {
                  setPending(null);
                });
              }}
            >
              {pending === entry.id ? <PendingLabel label={t('loading')} /> : t('queueRestore')}
            </button>
          )}
          <button
            type="button"
            className="button compact"
            disabled={pending !== null}
            onClick={() => {
              setPending(entry.id);
              void run(() => api.removeQueuedChat({ sessionId, id: entry.id })).finally(() => {
                setPending(null);
              });
            }}
          >
            {t('remove')}
          </button>
        </div>
      ))}
    </div>
  );
}
