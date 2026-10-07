import {
  Bot,
  Brain,
  Check,
  ChevronDown,
  Circle,
  Eye,
  FilePenLine,
  Globe,
  Image,
  ListChecks,
  LoaderCircle,
  Minimize2,
  Search,
  ShieldCheck,
  Terminal,
  Wrench,
  Monitor,
  X,
} from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatItemActivity, ChatMessage } from '../../../domain/models';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatImage } from './ChatImage';
import { DiffFiles } from '../history/DiffFiles';
import { MessageCopyButton } from './MessageCopyButton';
import { chatActivityLabels } from '../../locales/chat-en';
import { liveActivityMessage, type AgentStates } from './timeline';
import { ChatAgents } from './ChatAgents';
import { ChatElapsed } from './ChatElapsed';

const icons = {
  command: Terminal,
  read: Eye,
  search: Search,
  'file-change': FilePenLine,
  mcp: Wrench,
  dynamic: Wrench,
  browser: Monitor,
  'web-search': Globe,
  'image-generation': Image,
  agent: Bot,
  plan: ListChecks,
  compaction: Minimize2,
  review: ShieldCheck,
};

function ActivityIcon({ message }: { message: ChatMessage }) {
  const Icon = message.role === 'reasoning' ? Brain : icons[message.activity?.kind ?? 'dynamic'];
  return <Icon size={14} aria-hidden="true" />;
}
function ActivityLabel({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const activity = message.activity;
  const kind = activity?.kind;
  if (message.role === 'reasoning')
    return (
      <>
        {t(message.streaming ? 'thinking' : 'chatThought')}
        <span className="chat-work-subtitle">
          {message.text
            .replace(/[*#`]/g, '')
            .split('\n')
            .find((line) => line.trim())}
        </span>
      </>
    );
  return (
    <>
      <span>{t(kind ? chatActivityLabels[kind] : 'toolActivity')}</span>
      {(activity?.command || activity?.title) && (
        <span className="chat-work-subtitle">{activity.command || activity.title}</span>
      )}
      {kind === 'file-change' && message.files[0] && (
        <span className="chat-work-subtitle">
          {message.files[0].path}
          {message.files.length > 1 ? ` +${String(message.files.length - 1)}` : ''}
        </span>
      )}
    </>
  );
}

export function ChatWorkLog({
  messages,
  root,
  mediaGeneration,
  active,
  agents = new Map(),
}: {
  messages: ChatMessage[];
  root: string;
  mediaGeneration: number;
  active: boolean;
  agents?: AgentStates;
}) {
  const { t, i18n } = useTranslation();
  const [disclosure, setDisclosure] = useState<boolean | null>(null);
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const liveMessage = active ? liveActivityMessage(messages, agents) : undefined;
  const latest = liveMessage ?? messages.at(-1);
  const live = liveMessage !== undefined;
  const expanded = disclosure ?? live;
  useLayoutEffect(() => {
    if (live && expanded && follow.current && list.current)
      list.current.scrollTop = list.current.scrollHeight;
  }, [messages, live, expanded]);
  if (!latest) return null;
  const failed = messages.some(
    (message) => message.activity?.status === 'failed' || message.role === 'error',
  );
  return (
    <section className={`chat-work-log ${live ? 'is-live' : ''}`} aria-label={t('toolActivity')}>
      <button
        type="button"
        className="chat-work-heading"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => {
          setDisclosure(!expanded);
        }}
      >
        <span className="chat-work-icon">
          <ActivityIcon message={latest} />
        </span>
        <span className={`chat-work-label ${live ? 'chat-work-shimmer' : ''}`}>
          <ActivityLabel message={latest} />
          {messages.length > 1 && (
            <span className="chat-work-count">
              {new Intl.NumberFormat(i18n.resolvedLanguage).format(messages.length)}
            </span>
          )}
        </span>
        {live && <ChatElapsed />}
        {failed && <X size={12} className="chat-tool-failed" aria-label={t('chatToolFailed')} />}
        <ChevronDown size={12} className={expanded ? 'rotated' : ''} />
      </button>
      {expanded && (
        <div
          className="chat-work-items"
          id={id}
          ref={list}
          onScroll={(event) => {
            const element = event.currentTarget;
            follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
          }}
        >
          {messages.map((message) => (
            <WorkEntry
              key={message.id}
              message={message}
              root={root}
              mediaGeneration={mediaGeneration}
              live={active && (message.streaming === true || message.activity?.status === 'inProgress')}
              agentsLive={active}
              agents={agents}
            />
          ))}
        </div>
      )}
      {!expanded &&
        messages
          .flatMap((message) => message.generatedImages ?? [])
          .map((path) => <ChatImage key={path} path={path} mediaGeneration={mediaGeneration} />)}
    </section>
  );
}

function ToolStatus({ activity, live }: { activity: ChatItemActivity | undefined; live: boolean }) {
  const { t } = useTranslation();
  if (live) return <LoaderCircle size={12} className="spin" aria-label={t('working')} />;
  if (activity?.status === 'failed' || activity?.status === 'declined')
    return <X size={12} className="chat-tool-failed" aria-label={t('chatToolFailed')} />;
  if (activity?.status === 'inProgress')
    return <Circle size={10} aria-label={t('chatActivityReported', { status: t('working') })} />;
  if (activity?.status === 'interrupted') return <Circle size={10} aria-label={t('chatToolStopped')} />;
  return <Check size={12} aria-label={t('chatToolCompleted')} />;
}

function WorkEntry({
  message,
  root,
  mediaGeneration,
  live,
  agentsLive,
  agents,
}: {
  message: ChatMessage;
  root: string;
  mediaGeneration: number;
  live: boolean;
  agentsLive: boolean;
  agents: AgentStates;
}) {
  const { t, i18n } = useTranslation();
  const [disclosure, setDisclosure] = useState<boolean | null>(null);
  const id = useId();
  const reasoning = message.role === 'reasoning';
  const activity = message.activity;
  const expanded = disclosure ?? (reasoning && live);
  const detail = activity?.detail ?? message.text;
  const inspectable =
    !!detail ||
    message.files.length > 0 ||
    !!message.generatedImages?.length ||
    !!activity?.steps?.length ||
    !!activity?.agents?.length;
  const duration = activity?.durationMs;
  return (
    <div className="chat-work-entry">
      <button
        type="button"
        className="chat-work-row"
        aria-expanded={expanded}
        aria-controls={inspectable ? id : undefined}
        disabled={!inspectable}
        onClick={() => {
          setDisclosure(!expanded);
        }}
      >
        <span className="chat-work-icon">
          <ActivityIcon message={message} />
        </span>
        <span className="chat-work-label">
          <ActivityLabel message={message} />
        </span>
        {duration !== undefined && (
          <span className="chat-work-duration">
            {new Intl.NumberFormat(i18n.resolvedLanguage, {
              style: 'unit',
              unit: 'second',
              maximumFractionDigits: 1,
            }).format(duration / 1000)}
          </span>
        )}
        {!reasoning && <ToolStatus activity={activity} live={live} />}
        {inspectable && <ChevronDown size={11} className={expanded ? 'rotated' : ''} />}
      </button>
      {!expanded &&
        message.generatedImages?.map((path) => (
          <ChatImage key={path} path={path} mediaGeneration={mediaGeneration} />
        ))}
      {expanded && (
        <div className="chat-work-details message" id={id}>
          {activity?.agents && (
            <ChatAgents
              agents={activity.agents.map((agent) => {
                const observed = agents.get(agent.id);
                return observed
                  ? { ...observed, name: observed.name === observed.id ? agent.name : observed.name }
                  : agent;
              })}
              live={agentsLive}
              root={root}
              mediaGeneration={mediaGeneration}
            />
          )}
          {activity?.steps && (
            <ol className="chat-plan">
              {activity.steps.map((step, index) => (
                <li key={index}>
                  {step.status === 'completed' ? (
                    <Check size={13} />
                  ) : step.status === 'inProgress' && live ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : (
                    <Circle size={12} />
                  )}
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          )}
          {activity?.command && (
            <div className="chat-command-heading">
              <code>{activity.command}</code>
              <MessageCopyButton text={activity.command} />
            </div>
          )}
          {activity?.cwd && <div className="chat-command-cwd">{activity.cwd}</div>}
          {detail &&
            (reasoning || activity?.kind === 'plan' || activity?.kind === 'review' ? (
              <ChatMarkdown text={detail} root={root} mediaGeneration={mediaGeneration} streaming={live} />
            ) : (
              <div className="chat-tool-output">
                <pre>{detail}</pre>
                <MessageCopyButton text={detail} />
              </div>
            ))}
          {activity?.exitCode !== undefined && (
            <div className="chat-tool-exit">{t('chatToolExit', { code: String(activity.exitCode) })}</div>
          )}
          {message.files.length > 0 && <DiffFiles files={message.files} />}
          {message.generatedImages?.map((path) => (
            <ChatImage key={path} path={path} mediaGeneration={mediaGeneration} />
          ))}
        </div>
      )}
    </div>
  );
}
