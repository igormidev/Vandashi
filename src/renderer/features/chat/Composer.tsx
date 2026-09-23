import { ArrowUp, Paperclip, Square, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatSession, ModelSelection } from '../../../domain/models';
import { defaultSettings } from '../../../domain/defaults';
import { useApp } from '../../app/store';
import { IconButton, Tip } from '../../shared/ui';
import { ModelPicker } from './ModelPicker';
import { seedDraft, validSelection } from './session-state';
import type { Draft } from './session-state';
import { cacheDraft, readDraft } from './draft-cache';
import { RichComposer } from './RichComposer';
import { mentionReferences } from './mention-references';

export function Composer({ session }: { session: ChatSession }) {
  const { t } = useTranslation();
  const { api, state, models, workspace, run, busy, activity, dirty, chatTarget, refresh } = useApp();
  const seed = chatTarget?.topic === session.topic ? (chatTarget.prompt ?? null) : null;
  const [restored] = useState(() => readDraft(session.id, seed));
  const [draft, setDraft] = useState<Draft>(restored.draft);
  if (draft.seed !== seed) setDraft(seedDraft(draft, seed));
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
  const logoLabel = t('logo');
  const references = useMemo(
    () => (workspace ? mentionReferences(workspace, session.topic, logoLabel) : []),
    [workspace, session.topic, logoLabel],
  );
  const send = async () => {
    if (!text.trim() || busy || dirty || sending || !models.length) return;
    setSending(true);
    const value = await run(async () => {
      await api.sendChat({ sessionId: session.id, text: text.trim(), mode, selection, attachments });
      return true;
    });
    if (value) {
      setText('');
      setAttachments([]);
    }
    setSending(false);
  };
  const changeModel = (value: ModelSelection) => {
    setChosen(value);
    if (state)
      void run(async () => {
        await api.settings({ ...state.settings, chat: value });
        await refresh();
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
            disabled={busy || dirty || sending}
            onClick={() => {
              setDraft((current) => ({ ...current, text: current.pending ?? current.text, pending: null }));
            }}
          >
            {t('chatUsePrepared')}
          </button>
          <IconButton
            label={t('dismiss')}
            onClick={() => {
              setDraft((current) => ({ ...current, pending: null }));
            }}
          >
            <X size={12} />
          </IconButton>
        </div>
      )}
      <div
        className={`composer ${dirty ? 'locked' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (busy || dirty || sending) return;
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
                  onClick={() => {
                    setAttachments(attachments.filter((entry) => entry !== path));
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
          disabled={dirty || sending || busy}
          onChange={setText}
          placeholder={t(dirty ? 'dirtyHelp' : 'chatPlaceholder')}
          onSend={() => {
            void send();
          }}
        />
        <div className="composer-actions">
          <IconButton
            label={t('attach')}
            disabled={busy || dirty}
            onClick={() => {
              void run(async () => {
                const paths = await api.chooseFiles('assets');
                setAttachments((current) => [...new Set([...current, ...paths])]);
              });
            }}
          >
            <Paperclip size={16} />
          </IconButton>
          <select
            className="mode-select"
            aria-label={t('readMode')}
            value={mode}
            disabled={busy}
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
                onClick={() => {
                  void run(() => api.cancelChat());
                }}
                aria-label={t('stop')}
              >
                <Square size={14} fill="currentColor" />
              </button>
            </Tip>
          ) : (
            <button
              className="send-button"
              type="button"
              disabled={busy || !text.trim() || dirty || sending || !models.length}
              aria-label={t('send')}
              onClick={() => {
                void send();
              }}
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </div>
      <ModelPicker value={selection} onChange={changeModel} disabled={busy || sending} />
    </div>
  );
}
