import { memo, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../../domain/models';
import { diagnosticText, messageText } from '../../app/diagnostics';
import { PendingLabel } from '../../shared/ui';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatImage } from './ChatImage';
import { AttachmentStrip } from './AttachmentStrip';
import { DiffFiles } from '../history/DiffFiles';
import { MessageActions } from './MessageActions';
import { MessageWorked } from './MessageWorked';
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
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const bodyId = useId();
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
        className={`message message-with-meta ${message.role === 'user' ? 'user' : 'receipt'}`}
        data-message-id={message.id}
      >
        <div className="message-content">
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
          {message.files.length > 0 && <DiffFiles files={message.files} />}
        </div>
        <MessageActions
          message={message}
          text={message.userText ?? ''}
          collapsible={overflow || expanded}
          expanded={expanded}
          bodyId={bodyId}
          onToggle={() => {
            setExpanded(!expanded);
          }}
          {...(onEdit && message.role === 'user' && !message.pending
            ? {
                onEdit: () => {
                  onEdit(message);
                },
              }
            : {})}
          disabled={disabled}
          pending={pending}
        />
      </article>
    );
  if (message.diagnostic)
    return (
      <article className={`message message-with-meta ${message.role}`} data-message-id={message.id}>
        <p>{diagnosticText(message.diagnostic)}</p>
        {message.files.length > 0 && <DiffFiles files={message.files} />}
        <MessageActions message={message} text="" />
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
      className={`message message-with-meta ${message.role} ${message.phase === 'commentary' ? 'message-commentary' : ''}`}
      data-message-id={message.id}
    >
      <MessageWorked message={message} />
      <div className="message-content">
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
      </div>
      <MessageActions
        message={message}
        text={message.text}
        collapsible={message.role === 'user' && (overflow || expanded)}
        expanded={expanded}
        bodyId={bodyId}
        onToggle={() => {
          setExpanded(!expanded);
        }}
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
      {message.pending && (
        <PendingLabel label={t(message.pending === 'queued' ? 'queued' : 'sendingMessage')} />
      )}
    </article>
  );
});
