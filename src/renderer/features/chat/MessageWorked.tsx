import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../../domain/models';
import { formatChatElapsed } from './chat-elapsed';

export function MessageWorked({ message }: { message: ChatMessage }) {
  const { t, i18n } = useTranslation();
  const duration = message.turnDurationMs;
  if (
    message.role !== 'assistant' ||
    message.streaming === true ||
    duration === undefined ||
    !Number.isSafeInteger(duration) ||
    duration < 0
  )
    return null;
  return (
    <div className="message-worked">
      {t('chatWorkedFor', { time: formatChatElapsed(duration, i18n.resolvedLanguage ?? i18n.language) })}
    </div>
  );
}
