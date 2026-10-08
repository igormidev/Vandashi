import { mentionedPaths } from './mention-document';
import { ArrowUp, LoaderCircle, Paperclip, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatSession, ModelSelection } from '../../../domain/models';
import { defaultSettings } from '../../../domain/defaults';
import { clipHandoffText } from '../../../domain/clip-handoff';
import { useApp } from '../../app/store';
import { messageText } from '../../app/diagnostics';
import { IconButton, Tip } from '../../shared/ui';
import { ModelPicker } from './ModelPicker';
import { seedDraft, validSelection } from './session-state';
import type { Draft } from './session-state';
import { cacheDraft, readDraft } from './draft-cache';
import { RichComposer } from './RichComposer';
import { mentionReferences } from './mention-references';
import { setupTarget } from '../../../domain/setup';
import { useAttachments, attachmentReference } from './use-attachments';
import { AttachmentStrip } from './AttachmentStrip';
import { QueuedMessages } from './QueuedMessages';
import { ComposerMode } from './ComposerMode';
import { useComposerActions } from './use-composer-actions';
import { useComposerHistory } from './composer-history';
import { useComposerSubmit } from './use-composer-submit';
import { useComposerTools } from './use-composer-tools';
import { ComposerTools } from './ComposerTools';
import { ChatUsage } from './ChatUsage';
import '../../styles/chat-composer.css';

export function Composer({
  session,
  disabled = false,
  targeted = false,
  visible = true,
}: {
  session: ChatSession;
  disabled?: boolean;
  targeted?: boolean;
  visible?: boolean;
}) {
  const { t } = useTranslation();
  const {
    api,
    state,
    models,
    workspace,
    run,
    busy: appBusy,
    activity,
    dirty,
    chatTarget,
    refresh,
  } = useApp();
  const [savingModel, setSavingModel] = useState(false);
  const [modelFailure, setModelFailure] = useState(false);
  const modelOwner = useRef(false);
  const queueable =
    appBusy &&
    activity?.sessionId === session.id &&
    !['done', 'error'].includes(activity.phase) &&
    !/^(?:setup:|publish:)/u.test(session.topic);
  const busy = (appBusy && !queueable) || disabled || savingModel;
  // Resolve an explicit handoff once. Passive locale changes must not replace an existing draft.
  const seed = useMemo(() => {
    if (!targeted || chatTarget?.topic !== session.topic) return null;
    return chatTarget.handoff
      ? clipHandoffText(chatTarget.handoff, messageText)
      : (chatTarget.prompt ?? null);
  }, [chatTarget, session.topic, targeted]);
  const handoff = targeted && chatTarget?.topic === session.topic ? chatTarget.handoff : undefined;
  const [restored] = useState(() => readDraft(session.id, seed, handoff));
  const [draft, setDraft] = useState<Draft>(restored.draft);
  if (seed !== null && (draft.seed !== seed || (handoff && draft.handoff !== handoff)))
    setDraft(seedDraft(draft, seed, handoff));
  const text = draft.text;
  const setText = (value: string) => {
    setDraft((current) => ({ ...current, text: value }));
  };
  const [mode, setMode] = useState<'read' | 'edit'>(restored.mode);
  const [collaboration, setCollaboration] = useState<'default' | 'plan'>(restored.collaboration);
  const [chosen, setChosen] = useState<ModelSelection | null>(null);
  const selection = validSelection(chosen ?? state?.settings.chat ?? defaultSettings.chat, models);
  const [sending, setSending] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const submissionOwner = useRef(false);
  const attachmentState = useAttachments(
    text,
    setText,
    busy || dirty || sending,
    submissionOwner,
    restored.attachments,
  );
  useEffect(() => {
    cacheDraft(session.id, draft, mode, attachmentState.paths, collaboration);
  }, [session.id, draft, mode, attachmentState.paths, collaboration]);
  const { picking } = attachmentState;
  const locked = busy || dirty || sending || picking;
  const [cancelling, setCancelling] = useState(false);
  const logoLabel = t('logo');
  const installation = !!setupTarget(session.topic);
  const plan = !installation && collaboration === 'plan' && !(draft.handoff && text === draft.seed);
  const recall = useComposerHistory(text, session.messages, (value) => {
    setDraft((current) => ({ ...current, text: value }));
  });
  const references = useMemo(
    () => (workspace && !installation ? mentionReferences(workspace, session.topic, logoLabel) : []),
    [workspace, installation, session.topic, logoLabel],
  );
  const mentions = new Set(mentionedPaths(text));
  const mentionedImages = references.filter(
    (reference) => (reference.kind === 'image' || reference.kind === 'logo') && mentions.has(reference.path),
  );
  const attachments = [
    ...new Set([...attachmentState.paths, ...mentionedImages.map((reference) => reference.path)]),
  ].slice(0, 50);
  const send = useComposerSubmit({
    sessionId: session.id,
    draft,
    locked,
    queueable,
    plan,
    mode,
    selection,
    attachments,
    owner: submissionOwner,
    setSending,
    clearText: () => {
      setText('');
    },
    clearAttachments: attachmentState.clear,
  });
  useComposerActions({
    sessionId: session.id,
    locked,
    draft,
    attachments: attachmentState.paths,
    owner: submissionOwner,
    setDraft,
    setMode,
    setCollaboration,
    restoreAttachments: attachmentState.restore,
    setSending,
    setFocusKey,
    submit: send,
  });
  const tools = useComposerTools({
    visible,
    session,
    draft,
    mode,
    collaboration,
    attachments: attachmentState.paths,
    locked,
    modelLocked: appBusy || disabled || savingModel || sending || picking || !models.length,
    owner: submissionOwner,
    setDraft,
    setMode,
    setCollaboration,
    restoreAttachments: attachmentState.restore,
    clearAttachments: attachmentState.clear,
    setSending,
    setFocusKey,
  });
  const changeModel = (value: ModelSelection) => {
    if (!state || modelOwner.current) return;
    modelOwner.current = true;
    setChosen(value);
    setSavingModel(true);
    setModelFailure(false);
    void run(async () => {
      try {
        await api.settings({ ...state.settings, chat: value });
        if (await refresh()) setChosen(null);
        else setModelFailure(true);
      } catch (error) {
        setModelFailure(true);
        throw error;
      }
    }).finally(() => {
      modelOwner.current = false;
      setSavingModel(false);
    });
  };
  return (
    <div className="composer-wrap">
      <QueuedMessages
        sessionId={session.id}
        canRestore={!text.trim() && !draft.pending && !attachments.length && !locked}
        restore={async (entry) => {
          if (text.trim() || draft.pending || attachments.length || locked || submissionOwner.current) return;
          submissionOwner.current = true;
          setSending(true);
          try {
            await api.removeQueuedChat({ sessionId: session.id, id: entry.id });
            setDraft((current) => ({
              text: entry.request.text,
              seed: entry.request.handoff ? entry.request.text : current.seed,
              pending: null,
              ...(entry.request.handoff ? { handoff: entry.request.handoff } : {}),
            }));
            setMode(entry.request.mode);
            setCollaboration(entry.request.collaboration ?? 'default');
            attachmentState.restore(entry.request.attachments);
            setFocusKey((current) => current + 1);
          } finally {
            submissionOwner.current = false;
            setSending(false);
          }
        }}
      />
      {draft.pending && (
        <div className="chat-seed">
          <span>{t('chatPreparedDraft')}</span>
          <button
            className="button small"
            type="button"
            disabled={locked}
            onClick={() => {
              setDraft((current) => ({ ...current, text: current.pending ?? current.text, pending: null }));
            }}
          >
            {t('chatUsePrepared')}
          </button>
          <button
            className="button small ghost"
            type="button"
            disabled={locked}
            onClick={() => {
              setDraft((current) => ({ ...current, pending: null }));
            }}
          >
            {t('chatKeepDraft')}
          </button>
        </div>
      )}
      <div
        className={`composer ${dirty ? 'locked' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (locked || submissionOwner.current) return;
          attachmentState.paste(Array.from(event.dataTransfer.files));
        }}
      >
        <AttachmentStrip
          paths={attachments}
          disabled={locked}
          onRemove={(path) => {
            attachmentState.remove(path);
          }}
        />
        <ComposerTools controls={tools} />
        <RichComposer
          focusKey={focusKey}
          value={text}
          references={[...references, ...attachmentState.paths.map(attachmentReference)]}
          disabled={locked}
          onChange={attachmentState.changed}
          onPasteFiles={attachmentState.paste}
          onHistory={(direction) => !locked && !draft.pending && !attachments.length && recall(direction)}
          onCommandKeyDown={tools.keyDown}
          onCommandSuggestion={tools.onSuggestion}
          commandMenu={tools.commandMenu}
          placeholder={t(dirty ? 'dirtyHelp' : 'chatPlaceholder')}
          onSend={() => {
            void send();
          }}
        />
        <div className="composer-actions">
          <ComposerMode
            mode={mode}
            plan={plan}
            installation={installation}
            canPlan={!installation && !(draft.handoff && text === draft.seed)}
            disabled={!visible || busy || sending || picking}
            onChange={(value) => {
              if (submissionOwner.current) return;
              setCollaboration(value === 'plan' ? 'plan' : 'default');
              setMode(value === 'plan' || value === 'read' ? 'read' : 'edit');
            }}
          />
          <div className="spacer" />
          {appBusy && activity?.sessionId === session.id && (
            <Tip label={t('stop')}>
              <button
                className="send-button stop"
                type="button"
                disabled={cancelling}
                aria-busy={cancelling}
                onClick={() => {
                  setCancelling(true);
                  void run(() => api.cancelChat()).finally(() => {
                    setCancelling(false);
                  });
                }}
                aria-label={t('stop')}
              >
                {cancelling ? (
                  <LoaderCircle className="spin" size={16} aria-hidden="true" />
                ) : (
                  <Square size={14} fill="currentColor" />
                )}
              </button>
            </Tip>
          )}
          <ChatUsage sessionId={session.id} active={visible} hasThread={!!session.threadId} />
          <IconButton
            label={t('attach')}
            disabled={locked}
            aria-busy={picking}
            onClick={attachmentState.select}
          >
            {picking ? (
              <LoaderCircle className="spin" size={16} aria-hidden="true" />
            ) : (
              <Paperclip size={16} />
            )}
          </IconButton>
          <button
            className="send-button"
            type="button"
            disabled={locked || !text.trim() || !!draft.pending || !models.length}
            aria-busy={sending}
            aria-label={t(queueable ? 'queueMessage' : 'send')}
            onClick={() => {
              void send();
            }}
          >
            {sending ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <ArrowUp size={18} />}
          </button>
        </div>
      </div>
      <ModelPicker
        attached
        openRequest={tools.modelRequest}
        value={selection}
        onChange={changeModel}
        disabled={!visible || appBusy || disabled || savingModel || sending || picking}
        pending={savingModel}
        {...(modelFailure
          ? {
              onRetry: () => {
                changeModel(selection);
              },
            }
          : {})}
      />
    </div>
  );
}
