import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatChatElapsed } from './chat-elapsed';

/** Mount only during a live operation; this measures its observed interval, not historical run time. */
export function ChatElapsed() {
  const { t, i18n } = useTranslation();
  const [started] = useState(() => performance.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsed(performance.now() - started);
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [started]);
  const time = formatChatElapsed(elapsed, i18n.resolvedLanguage ?? i18n.language);
  return (
    <span className="chat-work-duration" aria-label={t('chatElapsedWorking', { time })} aria-live="off">
      {time}
    </span>
  );
}
