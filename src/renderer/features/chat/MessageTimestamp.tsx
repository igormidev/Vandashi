import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../../domain/models';
import { Tip } from '../../shared/ui';
import { relativeMessageTime } from './message-time';

/** Tooltip content mounts only while open, so settled histories do not run one timer per row. */
function RelativeTime({ createdAt }: { createdAt: string }) {
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
  const relative = relativeMessageTime(createdAt, now, i18n.resolvedLanguage ?? i18n.language);
  if (!relative) return null;
  return t(
    relative.kind === 'now' ? 'chatTimeJustNow' : relative.kind === 'ago' ? 'chatTimeAgo' : 'chatTimeFuture',
    { time: relative.time },
  );
}

export function MessageTimestamp({
  message,
}: {
  message: Pick<ChatMessage, 'createdAt' | 'timestampKnown'>;
}) {
  const { i18n } = useTranslation();
  const date = new Date(message.createdAt);
  if (message.timestampKnown === false || !Number.isFinite(date.getTime())) return null;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const timestamp = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
  const exact = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(date);
  return (
    <Tip label={<RelativeTime createdAt={message.createdAt} />}>
      <button type="button" className="message-time" aria-label={exact}>
        <time dateTime={message.createdAt}>{timestamp}</time>
      </button>
    </Tip>
  );
}
