import { LoaderCircle, MessageSquare, RotateCcw, Sparkles, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage, Scope } from '../../../domain/models';
import { scopeKey } from '../../../domain/defaults';
import { publishingUndoIssue } from '../../../domain/chat-undo-policy';
import { useApp } from '../../app/store';
import { diagnosticText, messageText } from '../../app/diagnostics';
import { Empty, IconButton, Loading, Modal, Tip, PendingLabel } from '../../shared/ui';
import { clearDraft } from './draft-cache';
import { Composer } from './Composer';
import { useSessions } from './use-sessions';
import { DiffFiles } from '../history/DiffFiles';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatImage } from './ChatImage';
import { sessionTitle } from './session-title';
import '../../styles/chat.css';

function Message({
  message,
  root,
  mediaGeneration,
}: {
  message: ChatMessage;
  root: string;
  mediaGeneration: number;
}) {
  const { t } = useTranslation();
  if (message.appMessage)
    return (
      <article className={`message ${message.role === 'user' ? 'user' : 'receipt'}`}>
        <p>{messageText(message.appMessage)}</p>
        {message.userText && (
          <div className="message-body">
            <ChatMarkdown text={message.userText} root={root} mediaGeneration={mediaGeneration} />
          </div>
        )}
        {message.files.length > 0 && <DiffFiles files={message.files} />}
      </article>
    );
  if (message.diagnostic)
    return (
      <article className={`message ${message.role}`}>
        <p>{diagnosticText(message.diagnostic)}</p>
        {message.files.length > 0 && <DiffFiles files={message.files} />}
      </article>
    );
  if (message.role === 'reasoning' || message.role === 'tool')
    return (
      <div>
        <details className="reasoning">
          <summary>
            <Sparkles size={12} />
            {t(message.role === 'reasoning' ? 'thinking' : 'toolActivity')}
          </summary>
          <pre>{message.text}</pre>
          {message.files.length > 0 && <DiffFiles files={message.files} />}
        </details>
        {message.generatedImages?.map((path) => (
          <ChatImage key={path} path={path} mediaGeneration={mediaGeneration} />
        ))}
      </div>
    );
  return (
    <article className={`message ${message.role}`}>
      <div className="message-body">
        <ChatMarkdown text={message.text} root={root} mediaGeneration={mediaGeneration} />
      </div>
      {message.files.length > 0 && <DiffFiles files={message.files} />}
    </article>
  );
}
export function ChatPane() {
  const { workspace } = useApp();
  const brandId = workspace?.scope.brandId;
  const videoId = workspace?.scope.videoId ?? null;
  const clipId = workspace?.scope.clipId ?? null;
  const scope = useMemo(() => (brandId ? { brandId, videoId, clipId } : null), [brandId, videoId, clipId]);
  return scope ? <Conversation key={scopeKey(scope)} scope={scope} /> : null;
}
function Conversation({ scope }: { scope: Scope }) {
  const { t } = useTranslation();
  const { api, run, chatTarget, setChatTarget, busy, activity, dirty, workspace } = useApp();
  const {
    sessions,
    selected,
    setSelected,
    loading,
    opening,
    retrying,
    closing,
    failed,
    retry,
    replace,
    close,
    mediaGeneration,
  } = useSessions(scope);
  const [confirm, setConfirm] = useState<'reset' | 'undo' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [resetVersion, setResetVersion] = useState<Record<string, number>>({});
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const session = sessions.find((entry) => entry.id === selected && entry.open);
  const undoIssue = session ? publishingUndoIssue(session) : null;
  const lastMessage = session?.messages.at(-1);
  useEffect(() => {
    follow.current = true;
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [selected]);
  useEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [lastMessage?.text, lastMessage?.id, activity?.phase]);
  return (
    <section className="chat-pane" aria-label={t('chat')}>
      <div className="chat-tabs">
        {sessions
          .filter((entry) => entry.open)
          .map((entry) => (
            <div className={`chat-tab ${selected === entry.id ? 'active' : ''}`} key={entry.id}>
              <button
                type="button"
                disabled={busy || dirty}
                onClick={() => {
                  setSelected(entry.id);
                  setChatTarget(null);
                }}
              >
                <MessageSquare size={12} />
                <span>{sessionTitle(entry, t)}</span>
              </button>
              <button
                className="close-tab"
                type="button"
                aria-label={t('close')}
                aria-busy={closing.includes(entry.id)}
                disabled={busy || dirty || closing.includes(entry.id)}
                onClick={() => {
                  if (selected === entry.id) setChatTarget(null);
                  void run(() => close(entry.id));
                }}
              >
                {closing.includes(entry.id) ? (
                  <LoaderCircle className="spin" size={12} aria-hidden="true" />
                ) : (
                  <X size={12} />
                )}
              </button>
            </div>
          ))}
      </div>
      {(opening || (retrying && !failed)) && session && (
        <div className="chat-toolbar" role="status">
          <PendingLabel label={t('loading')} />
        </div>
      )}
      {session ? (
        <>
          <div className="chat-toolbar">
            <span className="chat-scope">
              <Sparkles size={13} />
              {sessionTitle(session, t)}
            </span>
            {undoIssue ? (
              <Tip label={messageText(undoIssue)}>
                <button className="icon-button" type="button" aria-label={t('undoTurn')} aria-disabled="true">
                  <Undo2 size={14} />
                </button>
              </Tip>
            ) : (
              <IconButton
                label={t('undoTurn')}
                disabled={busy || dirty || opening || !session.checkpoints?.length}
                onClick={() => {
                  setConfirm('undo');
                }}
              >
                <Undo2 size={14} />
              </IconButton>
            )}
            <IconButton
              label={t('newConversation')}
              disabled={busy || dirty || opening}
              onClick={() => {
                setConfirm('reset');
              }}
            >
              <RotateCcw size={14} />
            </IconButton>
          </div>
          <div
            className="messages"
            ref={scroll}
            onScroll={(event) => {
              const node = event.currentTarget;
              follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
            }}
          >
            {session.messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                mediaGeneration={mediaGeneration[session.id] ?? 0}
                root={workspace?.video?.path ?? `${workspace?.brand.path ?? ''}/brand_identity`}
              />
            ))}
            {!session.messages.length && (
              <div className="chat-start">
                <Sparkles size={25} />
                <h2>{sessionTitle(session, t)}</h2>
              </div>
            )}
            {activity?.sessionId === session.id && (
              <div className="activity">
                <span className="status-dot busy" />
                <span>{t(activity.phase === 'committing' ? 'committing' : 'working')}</span>
              </div>
            )}
          </div>
          {sessions
            .filter((entry) => entry.open)
            .map((entry) => (
              <div key={entry.id} hidden={entry.id !== selected}>
                <Composer
                  key={`${entry.id}:${String(resetVersion[entry.id] ?? 0)}`}
                  session={entry}
                  disabled={opening || closing.includes(entry.id)}
                />
              </div>
            ))}
        </>
      ) : loading || opening || retrying ? (
        <Loading />
      ) : (
        <Empty
          icon={<MessageSquare size={30} strokeWidth={1.2} />}
          title={t('noChat')}
          description={t('noChatHelp')}
        />
      )}
      {failed && (
        <div className="chat-retry" role="status">
          <span>{t('chatLoadError')}</span>
          <button
            className="button small"
            type="button"
            disabled={busy || opening || retrying}
            aria-busy={opening || retrying}
            onClick={() => {
              if (chatTarget) setChatTarget({ ...chatTarget });
              else void run(retry);
            }}
          >
            {opening || retrying ? <PendingLabel label={t('loading')} /> : t('retry')}
          </button>
        </div>
      )}
      <Modal
        title={t(confirm === 'undo' ? 'undoTurn' : 'resetConversation')}
        description={t(confirm === 'undo' ? 'undoTurnHelp' : 'resetConversationHelp')}
        open={confirm !== null}
        locked={confirming}
        onClose={() => {
          setConfirm(null);
        }}
      >
        <div className="modal-actions">
          <button
            className="button"
            type="button"
            disabled={confirming}
            onClick={() => {
              setConfirm(null);
            }}
          >
            {t('cancel')}
          </button>
          <button
            className="button primary"
            type="button"
            disabled={confirming}
            aria-busy={confirming}
            onClick={() => {
              if (!session) return;
              setConfirming(true);
              void run(async () => {
                const result =
                  confirm === 'undo' ? await api.undoChat(session.id) : await api.resetChat(session.id);
                replace(result);
                if (confirm === 'reset') {
                  clearDraft(session.id);
                  setResetVersion((value) => ({ ...value, [session.id]: (value[session.id] ?? 0) + 1 }));
                  setChatTarget(null);
                }
                setConfirm(null);
              }).finally(() => {
                setConfirming(false);
              });
            }}
          >
            {confirming ? <PendingLabel label={t('loading')} /> : t('continue')}
          </button>
        </div>
      </Modal>
    </section>
  );
}
