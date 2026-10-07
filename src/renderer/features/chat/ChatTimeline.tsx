import { agentStatesByTurn, chatTimeline, currentTimelineTurn } from './timeline';
import type { ChatMessage } from '../../../domain/models';
import { Message } from './ChatMessage';
import { ChatWorkLog } from './ChatWorkLog';
import { memo, useCallback, useLayoutEffect, useRef } from 'react';
import { useTimelineSelection } from './use-timeline-selection';
import './chat-timeline.css';

const WorkLog = memo(
  ChatWorkLog,
  (previous, next) =>
    previous.root === next.root &&
    previous.mediaGeneration === next.mediaGeneration &&
    previous.active === next.active &&
    previous.messages.length === next.messages.length &&
    previous.messages.every((message, index) => message === next.messages[index]) &&
    (previous.agents?.size ?? 0) === (next.agents?.size ?? 0) &&
    [...(previous.agents ?? [])].every(([id, agent]) => next.agents?.get(id) === agent),
);

export function ChatTimeline({
  messages,
  root,
  mediaGeneration,
  active = false,
  onQuote,
  onCitation,
  onPlanAction,
  disabled = false,
  onEdit,
  onFork,
  pendingMessageId,
}: {
  messages: ChatMessage[];
  root: string;
  mediaGeneration: number;
  active?: boolean;
  onQuote?: (text: string, message: ChatMessage) => void;
  onCitation?: (messageId: string) => void;
  onPlanAction?: (action: 'implement' | 'revise', message: ChatMessage) => void;
  disabled?: boolean;
  onEdit?: (message: ChatMessage) => void;
  onFork?: (message: ChatMessage) => void;
  pendingMessageId?: string | null;
}) {
  const timeline = useRef<HTMLDivElement>(null);
  const selection = useTimelineSelection(timeline);
  const handlers = useRef({ onQuote, onCitation, onPlanAction, onEdit, onFork });
  useLayoutEffect(() => {
    handlers.current = { onQuote, onCitation, onPlanAction, onEdit, onFork };
  });
  const quote = useCallback((text: string, message: ChatMessage) => {
    handlers.current.onQuote?.(text, message);
  }, []);
  const citation = useCallback((messageId: string) => {
    handlers.current.onCitation?.(messageId);
  }, []);
  const plan = useCallback((action: 'implement' | 'revise', message: ChatMessage) => {
    handlers.current.onPlanAction?.(action, message);
  }, []);
  const edit = useCallback((message: ChatMessage) => {
    handlers.current.onEdit?.(message);
  }, []);
  const fork = useCallback((message: ChatMessage) => {
    handlers.current.onFork?.(message);
  }, []);
  const entries = chatTimeline(messages);
  const currentTurn = currentTimelineTurn(messages);
  const agents = agentStatesByTurn(messages);
  return (
    <div className="chat-timeline" ref={timeline}>
      {entries.map((entry) => (
        <div
          className="chat-timeline-row"
          key={entry.kind === 'activity' ? entry.id : entry.message.id}
          data-chat-row-id={entry.kind === 'activity' ? entry.id : entry.message.id}
        >
          {entry.kind === 'activity' ? (
            <WorkLog
              messages={entry.messages}
              root={root}
              mediaGeneration={mediaGeneration}
              active={active && currentTurn !== null && entry.messages[0]?.turnId === currentTurn}
              agents={agents.get(entry.messages[0]?.turnId ?? '') ?? new Map()}
            />
          ) : (
            <Message
              message={entry.message}
              root={root}
              mediaGeneration={mediaGeneration}
              selectedText={selection?.id === entry.message.id ? selection.text : ''}
              {...(onQuote ? { onQuote: quote } : {})}
              {...(onCitation ? { onCitation: citation } : {})}
              {...(onPlanAction ? { onPlanAction: plan } : {})}
              disabled={disabled}
              pending={pendingMessageId === entry.message.id}
              {...(onEdit ? { onEdit: edit } : {})}
              {...(onFork ? { onFork: fork } : {})}
            />
          )}
        </div>
      ))}
    </div>
  );
}
