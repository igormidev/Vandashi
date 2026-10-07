import { Bot, Check, Circle, LoaderCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatItemActivity } from '../../../domain/models';
import { ChatMarkdown } from './ChatMarkdown';
import './chat-markdown.css';

export function ChatAgents({
  agents,
  live,
  root,
  mediaGeneration,
}: {
  agents: NonNullable<ChatItemActivity['agents']>;
  live: boolean;
  root: string;
  mediaGeneration: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="chat-agents">
      {agents.map((agent) => {
        const working = agent.status === 'inProgress' || agent.status === 'pending';
        const failed = agent.status === 'failed' || agent.status === 'declined';
        const complete = agent.status === 'completed';
        const reported = t(
          working
            ? agent.status === 'pending'
              ? 'queued'
              : 'working'
            : complete
              ? 'chatToolCompleted'
              : failed
                ? 'chatToolFailed'
                : 'chatToolStopped',
        );
        const status = working && !live ? t('chatActivityReported', { status: reported }) : reported;
        return (
          <details key={agent.id} className="chat-agent">
            <summary>
              <Bot size={14} />
              <span>{agent.name}</span>
              <span className="chat-agent-status">
                {working && live ? (
                  <LoaderCircle size={12} className="spin" />
                ) : complete ? (
                  <Check size={12} />
                ) : failed ? (
                  <X size={12} />
                ) : (
                  <Circle size={10} />
                )}
                {status}
              </span>
            </summary>
            {agent.result && (
              <ChatMarkdown text={agent.result} root={root} mediaGeneration={mediaGeneration} />
            )}
          </details>
        );
      })}
    </div>
  );
}
