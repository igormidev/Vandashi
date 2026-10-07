import { ChevronDown, Quote, Pencil, GitBranch, LoaderCircle } from 'lucide-react';
import { memo, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../../domain/models';
import { diagnosticText, messageText } from '../../app/diagnostics';
import { PendingLabel, IconButton } from '../../shared/ui';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatImage } from './ChatImage';
import { AttachmentStrip } from './AttachmentStrip';
import { DiffFiles } from '../history/DiffFiles';
import { MessageCopyButton } from './MessageCopyButton';
import { ChatWorkLog } from './ChatWorkLog';
import { ProposedPlanCard } from './ProposedPlanCard';
import './chat-timeline.css';

export const Message = memo(function Message({
  message,
  root,
  mediaGeneration,
  onQuote,
  onCitation,
  selectedText = '',
  onPlanAction,
  onEdit,
  onFork,
  disabled = false,
  pending = false,
}: {
  message: ChatMessage;
  root: string;
  mediaGeneration: number;
  onQuote?: (text: string, message: ChatMessage) => void;
  onCitation?: (messageId: string) => void;
  selectedText?: string;
  onPlanAction?: (action: 'implement' | 'revise', message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onFork?: (message: ChatMessage) => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  const date = new Date(message.createdAt);
  const timestamp =
    message.timestampKnown !== false && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' }).format(date)
      : null;
  useLayoutEffect(() => {
    if (message.role !== 'user' || expanded) return;
    const element = body.current;
    if (!element) return;
    const measure = () => {
      setOverflow(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [message.role, message.text, message.userText, expanded]);
  if (message.appMessage)
    return (
      <article
        className={`message ${message.role === 'user' ? 'user' : 'receipt'}`}
        data-message-id={message.id}
      >
        <p>{messageText(message.appMessage)}</p>
        {message.userText && (
          <div
            className={`message-body ${message.role === 'user' && !expanded ? 'message-user-clamped' : ''}`}
            ref={body}
            id={bodyId}
          >
            <ChatMarkdown
              text={message.userText}
              root={root}
              mediaGeneration={mediaGeneration}
              {...(onCitation ? { onCitation } : {})}
            />
          </div>
        )}
        {message.userText && (
          <MessageActions
            text={message.userText}
            collapsible={overflow || expanded}
            expanded={expanded}
            bodyId={bodyId}
            onToggle={() => {
              setExpanded(!expanded);
            }}
            {...(onEdit && message.role === 'user'
              ? {
                  onEdit: () => {
                    onEdit(message);
                  },
                }
              : {})}
            disabled={disabled}
          />
        )}
        {message.files.length > 0 && <DiffFiles files={message.files} />}
      </article>
    );
  if (message.diagnostic)
    return (
      <article className={`message ${message.role}`} data-message-id={message.id}>
        <p>{diagnosticText(message.diagnostic)}</p>
        {message.files.length > 0 && <DiffFiles files={message.files} />}
      </article>
    );
  if (message.role === 'reasoning' || message.role === 'tool')
    return <ChatWorkLog messages={[message]} root={root} mediaGeneration={mediaGeneration} active={false} />;
  if (message.proposedPlan)
    return (
      <ProposedPlanCard
        message={message}
        root={root}
        mediaGeneration={mediaGeneration}
        {...(onPlanAction ? { onPlanAction } : {})}
        disabled={disabled}
      />
    );
  return (
    <article
      className={`message ${message.role} ${message.phase === 'commentary' ? 'message-commentary' : ''}`}
      data-message-id={message.id}
    >
      {!!message.attachments?.length && (
        <AttachmentStrip paths={message.attachments} disabled onRemove={() => undefined} />
      )}
      <div
        className={`message-body ${message.role === 'user' && !expanded ? 'message-user-clamped' : ''}`}
        ref={body}
        id={bodyId}
      >
        <ChatMarkdown
          text={message.text}
          root={root}
          mediaGeneration={mediaGeneration}
          streaming={message.streaming === true}
          {...(onCitation ? { onCitation } : {})}
        />
      </div>
      {message.generatedImages?.map((path) => (
        <ChatImage key={path} path={path} mediaGeneration={mediaGeneration} />
      ))}
      {message.files.length > 0 && <DiffFiles files={message.files} />}
      {message.text && (
        <MessageActions
          text={message.text}
          collapsible={message.role === 'user' && (overflow || expanded)}
          expanded={expanded}
          bodyId={bodyId}
          onToggle={() => {
            setExpanded(!expanded);
          }}
          timestamp={timestamp}
          onQuote={
            message.role === 'assistant' && onQuote
              ? () => {
                  onQuote(selectedText || message.text, message);
                }
              : undefined
          }
          disabled={disabled}
          pending={pending}
          {...(onEdit && message.role === 'user' && !message.pending
            ? {
                onEdit: () => {
                  onEdit(message);
                },
              }
            : {})}
          {...(onFork && message.role === 'assistant' && message.turnId && message.streaming !== true
            ? {
                onFork: () => {
                  onFork(message);
                },
              }
            : {})}
        />
      )}
      {message.pending && (
        <PendingLabel label={t(message.pending === 'queued' ? 'queued' : 'sendingMessage')} />
      )}
    </article>
  );
});

function MessageActions({
  text,
  collapsible,
  expanded,
  bodyId,
  onToggle,
  timestamp,
  onQuote,
  disabled = false,
  onEdit,
  onFork,
  pending = false,
}: {
  text: string;
  collapsible: boolean;
  expanded: boolean;
  bodyId: string;
  onToggle: () => void;
  timestamp?: string | null;
  onQuote?: (() => void) | undefined;
  disabled?: boolean;
  onEdit?: () => void;
  onFork?: () => void;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="message-actions">
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
      <MessageCopyButton text={text} />
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
      {timestamp && (
        <span className="message-time" title={t('chatMessageTime', { time: timestamp })}>
          {timestamp}
        </span>
      )}
    </div>
  );
}
