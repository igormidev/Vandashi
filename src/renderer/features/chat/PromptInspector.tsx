import { ArrowLeft, FileText, Info, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatPromptInspection, PromptDocument, PromptReference } from '../../../domain/chat-prompt';
import type { Diagnostic } from '../../../domain/diagnostics';
import { diagnosticFromBridge } from '../../../domain/diagnostics';
import { useApp } from '../../app/store';
import { diagnosticText } from '../../app/diagnostics';
import { IconButton, Loading, Modal } from '../../shared/ui';
import { PromptText } from './PromptText';
import { readDraft } from './draft-cache';
import '../../styles/prompt-inspector.css';

export function PromptInspector({ sessionId, disabled = false }: { sessionId: string; disabled?: boolean }) {
  const { api } = useApp();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [inspection, setInspection] = useState<ChatPromptInspection | null>(null);
  const [source, setSource] = useState('preview');
  const [selectedDocument, setSelectedDocument] = useState<PromptDocument | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [history, setHistory] = useState<PromptDocument[]>([]);
  const [error, setError] = useState<Diagnostic | null>(null);
  const [failedReference, setFailedReference] = useState<PromptReference | null>(null);
  const owner = useRef(false);
  const revision = useRef(0);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );

  const load = async () => {
    if (owner.current) return;
    owner.current = true;
    const ticket = ++revision.current;
    setOpen(true);
    setLoading(true);
    setError(null);
    setHistory([]);
    setFailedReference(null);
    setInspection(null);
    setSource('preview');
    setSelectedDocument(null);
    setFailedSource(null);
    const draft = readDraft(sessionId, null);
    try {
      const value = await api.chatPrompt({
        sessionId,
        mode: draft.collaboration === 'plan' ? 'read' : draft.mode,
        collaboration: draft.collaboration,
      });
      if (ticket === revision.current) setInspection(value);
    } catch (failure) {
      if (ticket === revision.current) setError(diagnosticFromBridge(failure));
    } finally {
      if (ticket === revision.current) {
        owner.current = false;
        setLoading(false);
      }
    }
  };
  const read = async (reference: PromptReference) => {
    if (!inspection || owner.current) return;
    owner.current = true;
    const ticket = ++revision.current;
    setReading(true);
    setError(null);
    setFailedReference(reference);
    try {
      const document = await api.chatPromptDocument({
        inspectionId: inspection.id,
        referenceId: reference.id,
      });
      if (ticket === revision.current) {
        setHistory((previous) => [...previous, document]);
        setFailedReference(null);
      }
    } catch (failure) {
      if (ticket === revision.current) setError(diagnosticFromBridge(failure));
    } finally {
      if (ticket === revision.current) {
        owner.current = false;
        setReading(false);
      }
    }
  };
  const chooseSource = async (value: string) => {
    if (!inspection || owner.current) return;
    setSource(value);
    setHistory([]);
    setError(null);
    setFailedReference(null);
    setSelectedDocument(null);
    setFailedSource(null);
    if (value === 'preview' || value === 'developer') return;
    owner.current = true;
    const ticket = ++revision.current;
    setReading(true);
    setFailedSource(value);
    try {
      const document = await api.chatPromptSource({
        inspectionId: inspection.id,
        messageId: value.replace(/^developer:/u, ''),
        developer: value.startsWith('developer:'),
      });
      if (ticket === revision.current) {
        setSelectedDocument(document);
        setFailedSource(null);
      }
    } catch (failure) {
      if (ticket === revision.current) setError(diagnosticFromBridge(failure));
    } finally {
      if (ticket === revision.current) {
        owner.current = false;
        setReading(false);
      }
    }
  };
  const document =
    source === 'preview'
      ? inspection?.preview
      : source === 'developer'
        ? inspection?.developerTemplate
        : selectedDocument;
  const right = history.at(-1);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const stamp = (createdAt: string) => {
    const date = new Date(createdAt);
    return Number.isNaN(date.valueOf())
      ? t('promptSavedRequest')
      : date.toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' });
  };
  const locked = loading || reading;
  return (
    <>
      <IconButton
        label={t('promptInspector')}
        disabled={disabled}
        onClick={() => {
          void load();
        }}
      >
        <Info size={14} />
      </IconButton>
      <Modal
        title={t('promptInspector')}
        open={open}
        onClose={() => {
          revision.current++;
          setOpen(false);
        }}
        wide
        locked={locked}
      >
        <div className="prompt-inspector">
          {loading ? (
            <Loading />
          ) : inspection ? (
            <>
              <div className="prompt-source">
                <select
                  aria-label={t('promptSource')}
                  value={source}
                  disabled={reading}
                  onChange={(event) => {
                    void chooseSource(event.target.value);
                  }}
                >
                  <option value="preview">{t('promptNextMessage')}</option>
                  <option value="developer">{t('promptThreadTemplate')}</option>
                  {[...inspection.snapshots].reverse().map((entry) => (
                    <option key={entry.messageId} value={entry.messageId}>
                      {t('promptSavedAt', { time: stamp(entry.createdAt) })}
                    </option>
                  ))}
                  {inspection.snapshots
                    .filter((entry) => entry.hasDeveloper)
                    .map((entry) => (
                      <option key={'developer:' + entry.messageId} value={'developer:' + entry.messageId}>
                        {t('promptCapturedThread', { time: stamp(entry.createdAt) })}
                      </option>
                    ))}
                </select>
                <span className="muted">{t('readMode')}</span>
              </div>
              <p className="prompt-note muted">
                {t(
                  source === 'preview'
                    ? 'promptPreviewHelp'
                    : source === 'developer'
                      ? 'promptThreadHelp'
                      : 'promptSavedHelp',
                )}
              </p>
              {source === 'preview' && !inspection.skillsAvailable && (
                <p className="prompt-note muted">{t('promptSkillsUnavailable')}</p>
              )}
              {source === 'preview' && inspection.hasLegacyMessages && (
                <p className="prompt-note muted">{t('promptLegacyHelp')}</p>
              )}
              <div className="prompt-panels">
                <section className="prompt-panel" aria-label={t('promptGuidance')}>
                  <div className="prompt-panel-heading">
                    <FileText size={14} />
                    <span>
                      {t(source.startsWith('developer') ? 'promptThreadInstructions' : 'promptGuidance')}
                    </span>
                  </div>
                  <div className="prompt-document-scroll" key={document?.id ?? 'loading-source'}>
                    {document ? (
                      <PromptText
                        document={document}
                        disabled={reading}
                        onReference={(reference) => {
                          void read(reference);
                        }}
                      />
                    ) : error && failedSource ? (
                      <div className="prompt-read-error" role="alert">
                        <p>{diagnosticText(error)}</p>
                        <button
                          type="button"
                          disabled={reading}
                          onClick={() => {
                            void chooseSource(failedSource);
                          }}
                        >
                          {t('retry')}
                        </button>
                      </div>
                    ) : (
                      <Loading />
                    )}
                  </div>
                </section>
                <section
                  className="prompt-panel prompt-file-panel"
                  aria-label={t('promptReferencedFile')}
                  aria-busy={reading}
                >
                  <div className="prompt-panel-heading">
                    <IconButton
                      label={t('back')}
                      disabled={!history.length || reading}
                      onClick={() => {
                        setHistory((previous) => previous.slice(0, -1));
                        setError(null);
                        setFailedReference(null);
                      }}
                    >
                      <ArrowLeft size={14} />
                    </IconButton>
                    <span>{right?.title ?? t('promptReferencedFile')}</span>
                    {reading && (
                      <LoaderCircle size={14} className="spin" aria-label={t('loading')} role="status" />
                    )}
                  </div>
                  {right?.path && (
                    <div className="prompt-file-path">
                      {right.path}
                      <span>{t('promptCurrentFile')}</span>
                    </div>
                  )}
                  <div className="prompt-document-scroll" key={right?.id ?? 'empty'}>
                    {error && !failedSource && (
                      <div className="prompt-read-error" role="alert">
                        <p>{diagnosticText(error)}</p>
                        <button
                          type="button"
                          disabled={reading}
                          onClick={() => {
                            if (failedReference) void read(failedReference);
                          }}
                        >
                          {t('retry')}
                        </button>
                      </div>
                    )}
                    {right ? (
                      <PromptText
                        document={right}
                        disabled={reading}
                        onReference={(reference) => {
                          void read(reference);
                        }}
                      />
                    ) : (
                      !error && (
                        <div className="prompt-file-empty muted">
                          {reading ? (
                            <Loading />
                          ) : (
                            <>
                              <FileText size={24} />
                              <p>{t('promptChooseFile')}</p>
                            </>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </section>
              </div>
            </>
          ) : (
            error && (
              <div className="prompt-read-error" role="alert">
                <p>{diagnosticText(error)}</p>
                <button
                  type="button"
                  onClick={() => {
                    void load();
                  }}
                >
                  {t('retry')}
                </button>
              </div>
            )
          )}
        </div>
      </Modal>
    </>
  );
}
