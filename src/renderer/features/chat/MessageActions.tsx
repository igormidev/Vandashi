import { ChevronDown, GitBranch, LoaderCircle, Pencil, Quote } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../../domain/models';
import { IconButton } from '../../shared/ui';
import { MessageCopyButton } from './MessageCopyButton';
import { MessageTimestamp } from './MessageTimestamp';

export function MessageActions({
  message,
  text,
  collapsible = false,
  expanded = false,
  bodyId,
  onToggle,
  onQuote,
  disabled = false,
  onEdit,
  onFork,
  pending = false,
  children,
}: {
  message: ChatMessage;
  text: string;
  collapsible?: boolean;
  expanded?: boolean;
  bodyId?: string;
  onToggle?: () => void;
  onQuote?: (() => void) | undefined;
  disabled?: boolean;
  onEdit?: () => void;
  onFork?: () => void;
  pending?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className={`message-actions ${message.role === 'user' ? 'user-actions' : 'assistant-actions'}`}>
      <MessageTimestamp message={message} />
      <div className="message-action-icons">
        {collapsible && (
          <button
            type="button"
            className="message-expand"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={onToggle}
          >
            <ChevronDown size={13} className={expanded ? 'rotated' : ''} />
            {t(expanded ? 'less' : 'more')}
          </button>
        )}
        {!!text && <MessageCopyButton text={text} />}
        {onEdit && (
          <IconButton label={t('chatEditFromHere')} disabled={disabled} onClick={onEdit}>
            <Pencil size={13} aria-hidden="true" />
          </IconButton>
        )}
        {onFork && (
          <IconButton label={t('chatFork')} disabled={disabled} aria-busy={pending} onClick={onFork}>
            {pending ? (
              <LoaderCircle size={13} className="spin" aria-hidden="true" />
            ) : (
              <GitBranch size={13} aria-hidden="true" />
            )}
          </IconButton>
        )}
        {onQuote && (
          <IconButton
            label={t('chatQuote')}
            className="icon-button message-quote"
            disabled={disabled}
            onClick={onQuote}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
          >
            <Quote size={13} aria-hidden="true" />
          </IconButton>
        )}
        {children}
      </div>
    </div>
  );
}
