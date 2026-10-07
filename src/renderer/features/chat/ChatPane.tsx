import { ArrowDown, GitBranch, LoaderCircle, MessageSquare, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TranscriptionStatus, useTranscriptionProgress } from '../transcription/TranscriptionStatus';
import { useTranslation } from 'react-i18next';
import type { Scope } from '../../../domain/models';
import { scopeKey } from '../../../domain/defaults';
import { useApp } from '../../app/store';
import { Empty, IconButton, Loading, Modal, PendingLabel } from '../../shared/ui';
import { clearDraft, readChatFontSize, cacheChatFontSize } from './draft-cache';
import type { CSSProperties } from 'react';
import { Composer } from './Composer';
import { useSessions } from './use-sessions';
import { sessionTitle } from './session-title';
import '../../styles/chat.css';
import { ChatTimeline } from './ChatTimeline';
import { useChatScroll } from './use-chat-scroll';
import { ChatInputPanel } from './ChatInputPanel';
import { insertComposerText, quotedText } from './composer-actions';
import { HistoryEditDialog } from './HistoryEditDialog';
import { ChatUsage } from './ChatUsage';
import { ChatToolbar } from './ChatToolbar';
import { useHistoryActions } from './use-history-actions';
import { ChatElapsed } from './ChatElapsed';

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
  const { api, run, chatTarget, setChatTarget, setToast, busy, activity, dirty, workspace } = useApp();
  const transcriptionProgress = useTranscriptionProgress();
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
  const [fontSize, setFontSize] = useState(readChatFontSize);
  const resizeText = (delta: number) => {
    const next = Math.max(10, Math.min(22, fontSize + delta));
    setFontSize(next);
    cacheChatFontSize(next);
  };
  const [resetVersion, setResetVersion] = useState<Record<string, number>>({});
  const session = sessions.find((entry) => entry.id === selected && entry.open);
  const history = useHistoryActions(session, replace, setSelected);
  const { paneRef, scrollRef, contentRef, composerRef, onScroll, toEnd, toMessage, away } = useChatScroll(
    session?.id,
  );
  return (
    <section
      className="chat-pane"
      ref={paneRef}
      aria-label={t('chat')}
      style={{ '--chat-font-size': `${String(fontSize)}px` } as CSSProperties}
    >
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
                {entry.branch ? <GitBranch size={12} /> : <MessageSquare size={12} />}
                <span>
                  {sessionTitle(entry, t)}
                  {entry.branch && ` · ${t('chatBranch')}`}
                </span>
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
          <ChatToolbar
            session={session}
            fontSize={fontSize}
            opening={opening}
            resizeText={resizeText}
            onUndo={() => {
              setConfirm('undo');
            }}
            onReset={() => {
              setConfirm('reset');
            }}
          />
          <div className="messages" ref={scrollRef} onScroll={onScroll}>
            <div className="messages-content" ref={contentRef}>
              <ChatTimeline
                key={session.id}
                messages={session.messages}
                mediaGeneration={mediaGeneration[session.id] ?? 0}
                root={workspace?.video?.path ?? `${workspace?.brand.path ?? ''}/brand_identity`}
                active={activity?.sessionId === session.id}
                disabled={busy || dirty || opening || history.pendingId !== null}
                onEdit={history.setTarget}
                onFork={history.fork}
                pendingMessageId={history.pendingId}
                onQuote={(text, message) => {
                  const source = [
                    '[',
                    t('chatQuoteSource'),
                    '](',
                    '#chat-message-',
                    encodeURIComponent(message.id),
                    ')',
                  ].join('');
                  if (!insertComposerText(session.id, { text: [quotedText(text), source].join('\n\n') }))
                    setToast({ kind: 'interface', key: 'chatDraftOccupied' });
                }}
                onCitation={(messageId) => {
                  if (!toMessage(messageId)) setToast({ kind: 'interface', key: 'chatQuoteUnavailable' });
                }}
                onPlanAction={(action, message) => {
                  const inserted = insertComposerText(session.id, {
                    text: t(action === 'implement' ? 'chatPlanImplementPrompt' : 'chatPlanRevisePrompt', {
                      plan: message.text,
                    }),
                    replace: true,
                    mode: action === 'implement' ? 'edit' : 'read',
                    collaboration: action === 'implement' ? 'default' : 'plan',
                    ...(action === 'implement' ? { submit: true } : {}),
                  });
                  if (!inserted) setToast({ kind: 'interface', key: 'chatDraftOccupied' });
                }}
              />
              {!session.messages.length && (
                <div className="chat-start">
                  <Sparkles size={25} />
                  <h2>{sessionTitle(session, t)}</h2>
                </div>
              )}
              {activity?.sessionId === session.id && (
                <div className="activity">
                  <span className="status-dot busy" />
                  {transcriptionProgress ? (
                    <TranscriptionStatus progress={transcriptionProgress} />
                  ) : (
                    <span>
                      {t(activity.phase === 'committing' ? 'committing' : 'working')}{' '}
                      <ChatElapsed
                        key={
                          session.messages
                            .filter((message) => message.role === 'user' && message.pending !== 'queued')
                            .at(-1)?.id ?? session.id
                        }
                      />
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {sessions
            .filter((entry) => entry.open)
            .map((entry) => (
              <div
                key={entry.id}
                className="chat-composer-slot"
                hidden={entry.id !== selected}
                ref={entry.id === selected ? composerRef : undefined}
              >
                {entry.id === selected && away && (
                  <IconButton
                    label={t('scrollToBottom')}
                    className="icon-button chat-scroll-end"
                    onClick={toEnd}
                  >
                    <ArrowDown size={15} aria-hidden="true" />
                  </IconButton>
                )}
                <ChatInputPanel sessionId={entry.id} />
                <Composer
                  key={`${entry.id}:${String(resetVersion[entry.id] ?? 0)}`}
                  session={entry}
                  visible={entry.id === selected}
                  targeted={!entry.branch && entry.id === selected && !opening}
                  disabled={opening || closing.includes(entry.id)}
                />
                <ChatUsage sessionId={entry.id} active={entry.id === selected} hasThread={!!entry.threadId} />
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
      {history.target && (
        <HistoryEditDialog
          onClose={history.close}
          onConfirm={history.confirm}
          refreshPending={history.refreshPending}
        />
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
