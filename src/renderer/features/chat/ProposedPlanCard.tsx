import { ListChecks, Pencil, Play } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../../domain/models';
import { ChatMarkdown } from './ChatMarkdown';
import { MessageActions } from './MessageActions';
import { MessageWorked } from './MessageWorked';
import { PendingLabel } from '../../shared/ui';
import { PlanDownload } from './PlanDownload';
import './chat-markdown.css';

export type PlanAction = (action: 'implement' | 'revise', message: ChatMessage) => void;
export function ProposedPlanCard({
  message,
  root,
  mediaGeneration,
  onPlanAction,
  disabled = false,
}: {
  message: ChatMessage;
  root: string;
  mediaGeneration: number;
  onPlanAction?: PlanAction | undefined;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const long = message.text.length > 900 || message.text.split('\n').length > 20;
  const title = message.text
    .split('\n')
    .find((line) => /^#\s+\S/.test(line))
    ?.replace(/^#\s+/, '');
  const displayed = message.text.replace(/^#\s+[^\n]+\n+/, '');
  const ready = message.streaming === false && !disabled;
  return (
    <article className="message message-with-meta assistant" data-message-id={message.id}>
      <MessageWorked message={message} />
      <div className="chat-proposed-plan">
        <div className="chat-plan-heading">
          <ListChecks size={15} />
          <span>{title || t('planProposed')}</span>
        </div>
        <div className={`chat-plan-body ${long && !expanded ? 'chat-plan-clamped' : ''}`} id={id}>
          <ChatMarkdown
            text={displayed}
            root={root}
            mediaGeneration={mediaGeneration}
            streaming={message.streaming === true}
          />
        </div>
        <div className="chat-plan-actions">
          {long && (
            <button
              type="button"
              className="button ghost small"
              aria-expanded={expanded}
              aria-controls={id}
              onClick={() => {
                setExpanded(!expanded);
              }}
            >
              {t(expanded ? 'less' : 'more')}
            </button>
          )}
          {!ready && message.streaming === true && <PendingLabel label={t('working')} />}
          {onPlanAction && (
            <>
              <button
                type="button"
                className="button ghost small"
                disabled={!ready || !message.text.trim()}
                onClick={() => {
                  onPlanAction('revise', message);
                }}
              >
                <Pencil size={12} />
                {t('planRevise')}
              </button>
              <button
                type="button"
                className="button small"
                disabled={!ready || !message.text.trim()}
                onClick={() => {
                  onPlanAction('implement', message);
                }}
              >
                <Play size={12} />
                {t('planImplement')}
              </button>
            </>
          )}
        </div>
      </div>
      <MessageActions message={message} text={message.text}>
        <PlanDownload
          text={message.text}
          title={title || t('planProposed')}
          disabled={message.streaming !== false}
        />
      </MessageActions>
    </article>
  );
}
