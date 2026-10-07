import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ListOrdered, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QueuedChat } from '../../../domain/models';
import { useApp } from '../../app/store';
import { IconButton, PendingLabel, Tip } from '../../shared/ui';
import { diagnosticFromBridge, type Diagnostic } from '../../../domain/diagnostics';
import { diagnosticText } from '../../app/diagnostics';
import '../../styles/chat-queue.css';

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
  const actionOwner = useRef(false);
  const [failure, setFailure] = useState<Diagnostic | null>(null);
  const [loading, setLoading] = useState(true);
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
  if (!entries.length && !failure && !loading) return null;
  return (
    <section className="queued-messages" aria-label={t('queueTitle')} aria-busy={loading || pending !== null}>
      <div className="queue-heading">
        <ListOrdered size={14} aria-hidden="true" />
        <span>{t('queueTitle')}</span>
        {!!entries.length && <span className="queue-count">{entries.length}</span>}
      </div>
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
      <div className="queue-list">
        {entries.map((entry, index) => (
          <article className="queued-message" key={entry.id} aria-busy={pending === entry.id}>
            {entry.failed && <span className="queue-held">{t('queueHeld')}</span>}
            <div className="queued-text">{entry.request.text}</div>
            <div className="queue-actions">
              {pending === entry.id && <PendingLabel label={t('loading')} />}
              {([-1, 1] as const).map((direction) => (
                <IconButton
                  key={direction}
                  label={t(direction === -1 ? 'queueMoveUp' : 'queueMoveDown')}
                  disabled={
                    pending !== null || (direction === -1 ? index === 0 : index === entries.length - 1)
                  }
                  aria-busy={pending === entry.id}
                  onClick={() => {
                    if (actionOwner.current) return;
                    const target = index + direction;
                    if (target < 0 || target >= entries.length) return;
                    const reviewedIds = entries.map((candidate) => candidate.id);
                    const ids = reviewedIds.slice();
                    const adjacent = ids[target];
                    if (!adjacent) return;
                    ids[target] = entry.id;
                    ids[index] = adjacent;
                    actionOwner.current = true;
                    setPending(entry.id);
                    void run(() => api.reorderQueuedChat({ sessionId, reviewedIds, ids })).finally(() => {
                      actionOwner.current = false;
                      setPending(null);
                    });
                  }}
                >
                  {direction === -1 ? (
                    <ArrowUp size={13} aria-hidden="true" />
                  ) : (
                    <ArrowDown size={13} aria-hidden="true" />
                  )}
                </IconButton>
              ))}
              <Tip label={canRestore ? t('queueEdit') : t('queueEditHelp')}>
                <button
                  type="button"
                  className="queue-action"
                  disabled={!canRestore || pending !== null}
                  aria-label={t('queueEdit')}
                  onClick={() => {
                    if (actionOwner.current) return;
                    actionOwner.current = true;
                    setPending(entry.id);
                    void run(() => restore(entry)).finally(() => {
                      actionOwner.current = false;
                      setPending(null);
                    });
                  }}
                >
                  <Pencil size={13} aria-hidden="true" />
                  {t('queueEdit')}
                </button>
              </Tip>
              <IconButton
                label={t('queueRemove')}
                disabled={pending !== null}
                onClick={() => {
                  if (actionOwner.current) return;
                  actionOwner.current = true;
                  setPending(entry.id);
                  void run(() => api.removeQueuedChat({ sessionId, id: entry.id, resume: true })).finally(
                    () => {
                      actionOwner.current = false;
                      setPending(null);
                    },
                  );
                }}
              >
                <Trash2 size={13} aria-hidden="true" />
              </IconButton>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
