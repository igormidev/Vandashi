import { ArrowUp, LoaderCircle, Paperclip, Square, X } from 'lucide-react';
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

export function Composer({ session, disabled = false }: { session: ChatSession; disabled?: boolean }) {
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
  const busy = appBusy || disabled || savingModel;
  // Resolve an explicit handoff once. Passive locale changes must not replace an existing draft.
  const seed = useMemo(() => {
    if (chatTarget?.topic !== session.topic) return null;
    return chatTarget.handoff
      ? clipHandoffText(chatTarget.handoff, messageText)
      : (chatTarget.prompt ?? null);
  }, [chatTarget, session.topic]);
  const handoff = chatTarget?.topic === session.topic ? chatTarget.handoff : undefined;
  const [restored] = useState(() => readDraft(session.id, seed, handoff));
  const [draft, setDraft] = useState<Draft>(restored.draft);
  if (seed !== null && (draft.seed !== seed || (handoff && draft.handoff !== handoff)))
    setDraft(seedDraft(draft, seed, handoff));
  const text = draft.text;
  const setText = (value: string) => {
    setDraft((current) => ({ ...current, text: value }));
  };
  const [attachments, setAttachments] = useState<string[]>([]);
  const [mode, setMode] = useState<'read' | 'edit'>(restored.mode);
  const [chosen, setChosen] = useState<ModelSelection | null>(null);
  useEffect(() => {
    cacheDraft(session.id, draft, mode);
  }, [session.id, draft, mode]);
  const selection = validSelection(chosen ?? state?.settings.chat ?? defaultSettings.chat, models);
  const [sending, setSending] = useState(false);
  const [picking, setPicking] = useState(false);
  const submissionOwner = useRef(false);
  const locked = busy || dirty || sending || picking;
  const [cancelling, setCancelling] = useState(false);
  const logoLabel = t('logo');
  const references = useMemo(
    () => (workspace ? mentionReferences(workspace, session.topic, logoLabel) : []),
    [workspace, session.topic, logoLabel],
  );
  const send = async () => {
    if (!text.trim() || draft.pending || locked || submissionOwner.current || !models.length) return;
    submissionOwner.current = true;
    setSending(true);
    const value = await run(async () => {
      await api.sendChat({
        sessionId: session.id,
        text: text.trim(),
        mode,
        selection,
        attachments,
        ...(draft.handoff && text === draft.seed ? { handoff: draft.handoff } : {}),
      });
      return true;
    });
    if (value) {
      setText('');
      setAttachments([]);
    }
    setSending(false);
    submissionOwner.current = false;
  };
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
          setAttachments((current) => [
            ...new Set([
              ...current,
              ...Array.from(event.dataTransfer.files)
                .map((file) => api.pathForFile(file))
                .filter(Boolean),
            ]),
          ]);
        }}
      >
        {attachments.length > 0 && (
          <div className="attachments">
            {attachments.map((path) => (
              <span className="badge" key={path}>
                {path.split(/[\\/]/).pop()}
                <button
                  type="button"
                  aria-label={t('remove')}
                  disabled={locked}
                  onClick={() => {
                    if (locked || submissionOwner.current) return;
                    setAttachments((current) => current.filter((entry) => entry !== path));
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <RichComposer
          value={text}
          references={references}
          disabled={locked}
          onChange={setText}
          placeholder={t(dirty ? 'dirtyHelp' : 'chatPlaceholder')}
          onSend={() => {
            void send();
          }}
        />
        <div className="composer-actions">
          <IconButton
            label={t('attach')}
            disabled={locked}
            aria-busy={picking}
            onClick={() => {
              if (locked || submissionOwner.current) return;
              submissionOwner.current = true;
              setPicking(true);
              void run(async () => {
                const paths = await api.chooseFiles('assets');
                setAttachments((current) => [...new Set([...current, ...paths])]);
              }).finally(() => {
                submissionOwner.current = false;
                setPicking(false);
              });
            }}
          >
            {picking ? (
              <LoaderCircle className="spin" size={16} aria-hidden="true" />
            ) : (
              <Paperclip size={16} />
            )}
          </IconButton>
          <select
            className="mode-select"
            aria-label={t('readMode')}
            value={mode}
            disabled={busy || sending || picking}
            onChange={(event) => {
              setMode(event.target.value === 'read' ? 'read' : 'edit');
            }}
          >
            <option value="read">{t('readMode')}</option>
            <option value="edit">{t('editMode')}</option>
          </select>
          <div className="spacer" />
          {busy && activity?.sessionId === session.id ? (
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
          ) : (
            <button
              className="send-button"
              type="button"
              disabled={locked || !text.trim() || !!draft.pending || !models.length}
              aria-busy={sending}
              aria-label={t('send')}
              onClick={() => {
                void send();
              }}
            >
              {sending ? (
                <LoaderCircle className="spin" size={18} aria-hidden="true" />
              ) : (
                <ArrowUp size={18} />
              )}
            </button>
          )}
        </div>
      </div>
      <ModelPicker
        value={selection}
        onChange={changeModel}
        disabled={busy || sending || picking}
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
