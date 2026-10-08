import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatUsage } from '../../../domain/chat-usage';
import { IconButton, PendingLabel } from '../../shared/ui';
import { quotaResetCountdown } from './quota-reset';

export function ChatUsageDetails({
  usage,
  loading,
  disabled,
  onRefresh,
}: {
  usage: ChatUsage | null;
  loading: boolean;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => {
      setNow(Date.now());
    };
    const timer = window.setInterval(update, 30_000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const numbers = new Intl.NumberFormat(language);
  const percentage = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 });
  const time = (value: string) =>
    new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  const context = usage?.context;
  const percent = context?.maxTokens ? context.usedTokens / context.maxTokens : null;
  return (
    <>
      <div className="chat-usage-row">
        <span>{t('usageContext')}</span>
        <strong>
          {percent !== null
            ? t('usageContextPercent', { percent: percentage.format(percent) })
            : t('usageUnavailable')}
        </strong>
      </div>
      {context && (
        <>
          <div className="chat-usage-tokens">
            {context.maxTokens
              ? t('usageTokens', {
                  used: numbers.format(context.usedTokens),
                  max: numbers.format(context.maxTokens),
                })
              : t('usageTokensOnly', { used: numbers.format(context.usedTokens) })}
          </div>
          {percent !== null && (
            <progress
              max={100}
              value={Math.max(0, Math.min(100, percent * 100))}
              aria-label={t('usageContext')}
            />
          )}
          {context.totalTokens !== null && (
            <div className="chat-usage-row">
              <span>{t('usageTotal')}</span>
              <span>{numbers.format(context.totalTokens)}</span>
            </div>
          )}
          <small>{t('usageReported', { time: time(context.observedAt) })}</small>
        </>
      )}
      <div className="chat-usage-row">
        <strong>{t('usageLimits')}</strong>
        <IconButton label={t('usageRefresh')} disabled={loading || disabled} onClick={onRefresh}>
          <RefreshCw size={13} />
        </IconButton>
      </div>
      {loading ? (
        <PendingLabel label={t('loading')} />
      ) : usage?.account.available ? (
        usage.account.windows.map((window) => {
          const reset = quotaResetCountdown(window.resetsAt, now, language);
          const duration = window.durationMinutes;
          const unit =
            duration !== null && duration >= 1440
              ? 'day'
              : duration !== null && duration >= 60
                ? 'hour'
                : 'minute';
          const divisor = unit === 'day' ? 1440 : unit === 'hour' ? 60 : 1;
          const label =
            duration === null
              ? t(window.id === 'primary' ? 'usagePrimary' : 'usageSecondary')
              : t('usageWindow', {
                  duration: new Intl.NumberFormat(language, {
                    style: 'unit',
                    unit,
                    unitDisplay: 'short',
                    maximumFractionDigits: 1,
                  }).format(duration / divisor),
                });
          return (
            <div className="chat-usage-limit" key={window.id}>
              <div className="chat-usage-row">
                <span>{label}</span>
                <strong>
                  {t('usageRemaining', { percent: percentage.format((100 - window.usedPercent) / 100) })}
                </strong>
              </div>
              <progress max={100} value={100 - window.usedPercent} aria-label={label} />
              {reset && (
                <>
                  <small>
                    {reset.minutesRemaining > 0
                      ? t('usageResetsIn', { duration: reset.duration })
                      : t('usageResetDue')}
                  </small>
                  <small>{t('usageResets', { time: time(window.resetsAt ?? '') })}</small>
                </>
              )}
            </div>
          );
        })
      ) : (
        <span className="muted">{t('usageUnavailable')}</span>
      )}
      <small>{t('usageAutoCompact')}</small>
    </>
  );
}
