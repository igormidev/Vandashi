import { Gauge, Minimize2, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { ChatUsage as Usage } from '../../../domain/chat-usage';
import { useApp } from '../../app/store';
import { IconButton, PendingLabel } from '../../shared/ui';
import '../../styles/chat-usage.css';
import { ChatUsageDetails } from './ChatUsageDetails';

export function ChatUsage({
  sessionId,
  active = true,
  hasThread = false,
}: {
  sessionId: string;
  active?: boolean;
  hasThread?: boolean;
}) {
  const { api, busy, dirty, run } = useApp();
  const { t, i18n } = useTranslation();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const owner = useRef(false);
  const cancelOwner = useRef(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [queued, setQueued] = useState(false);
  if (!active && open) setOpen(false);
  const language = i18n.resolvedLanguage ?? i18n.language;
  useEffect(() => {
    let current = true;
    let version = 0;
    let revision = 0;
    const refresh = () => {
      const ticket = ++version;
      const observed = revision;
      void api.chatUsage(sessionId).then(
        (snapshot) => {
          if (current && ticket === version) {
            setUsage((previous) => ({
              ...snapshot,
              context: revision === observed ? snapshot.context : (previous?.context ?? snapshot.context),
            }));
            setLoading(false);
          }
        },
        () => {
          if (current && ticket === version) {
            setUsage((previous) => ({
              context: revision === observed ? null : (previous?.context ?? null),
              account: { available: false, windows: [], checkedAt: new Date().toISOString() },
            }));
            setLoading(false);
          }
        },
      );
    };
    let queueEvent = false;
    const unsubscribe = api.onEvent((event) => {
      if (event.type === 'chat-usage' && event.sessionId === sessionId) {
        revision++;
        setUsage((previous) => ({
          context: event.context,
          account: previous?.account ?? {
            available: false,
            windows: [],
            checkedAt: new Date().toISOString(),
          },
        }));
      }
      if (event.type === 'chat-queue' && event.sessionId === sessionId) {
        queueEvent = true;
        setQueued(event.entries.length > 0);
      }
      if (
        active &&
        event.type === 'activity' &&
        event.activity.sessionId === sessionId &&
        ['done', 'error'].includes(event.activity.phase)
      )
        refresh();
    });
    void api.queuedChats(sessionId).then(
      (entries) => {
        if (current && !queueEvent) setQueued(entries.length > 0);
      },
      () => {
        if (current) setQueued(true);
      },
    );
    if (active) refresh();
    return () => {
      current = false;
      unsubscribe();
    };
  }, [api, sessionId, active, attempt]);
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = trigger.current;
    const panel = popup.current;
    if (!anchor || !panel) return;
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 24);
      panel.style.width = String(width) + 'px';
      panel.style.left =
        String(Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))) + 'px';
      panel.style.bottom = String(window.innerHeight - rect.top + 8) + 'px';
      panel.style.maxHeight = String(Math.max(80, rect.top - 20)) + 'px';
    };
    position();
    panel.focus();
    const outside = (event: Event) => {
      if (owner.current) return;
      if (event.target instanceof Node && !panel.contains(event.target) && !anchor.contains(event.target))
        setOpen(false);
    };
    const keyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!owner.current) {
          setOpen(false);
          anchor.focus();
        }
      }
      if (event.key === 'Tab') {
        const buttons = panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const first = buttons.item(0);
        const last = buttons.item(buttons.length - 1);
        if (!buttons.length) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard);
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  }, [open]);
  const context = usage?.context;
  const percent = context?.maxTokens ? context.usedTokens / context.maxTokens : null;
  const formatted =
    percent === null
      ? null
      : new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 }).format(percent);
  const canCompact = hasThread && !busy && !dirty && !queued && !compacting && !loading;
  const refresh = () => {
    setLoading(true);
    setAttempt((current) => current + 1);
  };
  const close = () => {
    if (!owner.current) {
      setOpen(false);
      trigger.current?.focus();
    }
  };
  return (
    <div className="chat-usage">
      <button
        ref={trigger}
        type="button"
        className="chat-usage-trigger"
        aria-label={t('usageTitle')}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        disabled={compacting}
        onClick={() => {
          if (!open) refresh();
          setOpen((current) => !current);
        }}
      >
        <svg
          className={percent !== null && percent > 0.9 ? 'context-ring warning' : 'context-ring'}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" className="context-ring-track" />
          {percent !== null && (
            <circle
              cx="12"
              cy="12"
              r="9"
              className="context-ring-fill"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={100 * (1 - Math.max(0, Math.min(1, percent)))}
            />
          )}
        </svg>
        <span>{compacting ? t('usageCompacting') : (formatted ?? t('usageTitle'))}</span>
        <Gauge size={13} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            id={id}
            className="chat-usage-popup"
            role="dialog"
            aria-label={t('usageTitle')}
            tabIndex={-1}
            aria-busy={loading || compacting}
          >
            <div className="chat-usage-heading">
              <strong>{t('usageTitle')}</strong>
              <IconButton label={t('close')} disabled={compacting} onClick={close}>
                <X size={13} />
              </IconButton>
            </div>
            <ChatUsageDetails usage={usage} loading={loading} disabled={compacting} onRefresh={refresh} />
            <button
              type="button"
              className="button small"
              disabled={!canCompact}
              title={canCompact ? undefined : t('usageCompactBlocked')}
              onClick={() => {
                if (owner.current || !canCompact) return;
                owner.current = true;
                setCompacting(true);
                void run(() => api.compactChat(sessionId)).finally(() => {
                  owner.current = false;
                  cancelOwner.current = false;
                  setCancelling(false);
                  setCompacting(false);
                  refresh();
                });
              }}
            >
              {compacting ? (
                <PendingLabel label={t('usageCompacting')} />
              ) : (
                <>
                  <Minimize2 size={14} aria-hidden="true" />
                  {t('usageCompact')}
                </>
              )}
            </button>
            {compacting && (
              <button
                type="button"
                className="button small"
                disabled={cancelling}
                aria-busy={cancelling}
                onClick={() => {
                  if (cancelOwner.current) return;
                  cancelOwner.current = true;
                  setCancelling(true);
                  void run(async () => {
                    try {
                      await api.cancelChat();
                    } catch (error) {
                      cancelOwner.current = false;
                      setCancelling(false);
                      throw error;
                    }
                  });
                }}
              >
                {cancelling ? <PendingLabel label={t('stop')} /> : t('stop')}
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
