import { ArrowLeft, ArrowRight, Check, CircleHelp } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatInputRequest } from '../../../domain/chat-input';
import { diagnosticFromBridge, type Diagnostic } from '../../../domain/diagnostics';
import { useApp } from '../../app/store';
import { diagnosticText } from '../../app/diagnostics';
import { PendingLabel } from '../../shared/ui';
import '../../styles/chat-input.css';

/** Subscribe before reading the snapshot, so a late snapshot cannot restore an answered request. */
export function ChatInputPanel({ sessionId }: { sessionId: string }) {
  const { api } = useApp();
  const { t } = useTranslation();
  const [request, setRequest] = useState<ChatInputRequest | null>(null);
  const [failure, setFailure] = useState<Diagnostic | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    let mounted = true;
    let receivedEvent = false;
    const unsubscribe = api.onEvent((event) => {
      if (event.type !== 'chat-input' || event.sessionId !== sessionId) return;
      receivedEvent = true;
      setRequest(event.request);
      setFailure(null);
      setRetrying(false);
    });
    void api.pendingChatInput(sessionId).then(
      (snapshot) => {
        if (mounted && !receivedEvent) {
          setRequest(snapshot);
          setFailure(null);
          setRetrying(false);
        }
      },
      (error: unknown) => {
        if (mounted && !receivedEvent) {
          setFailure(diagnosticFromBridge(error));
          setRetrying(false);
        }
      },
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [api, sessionId, attempt]);
  if (request) return <InputQuestions key={request.requestId} request={request} />;
  return failure || retrying ? (
    <section className="chat-input-panel" aria-label={t('inputRequest')} aria-busy={retrying}>
      {retrying ? (
        <PendingLabel label={t('loading')} />
      ) : (
        <span role="alert">{failure && diagnosticText(failure)}</span>
      )}
      <div className="chat-input-actions">
        <button
          type="button"
          className="button small"
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            setAttempt((current) => current + 1);
          }}
        >
          {t('retry')}
        </button>
      </div>
    </section>
  ) : null;
}

function InputQuestions({ request }: { request: ChatInputRequest }) {
  const { t } = useTranslation();
  const { api, run } = useApp();
  const groupId = useId();
  const owner = useRef(false);
  const [pending, setPending] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, boolean>>({});
  const question = request.questions[index];
  if (!question) return null;
  const answered = (id: string) => Boolean(answers[id]?.trim());
  const complete = request.questions.every((entry) => answered(entry.id));
  const submit = () => {
    if (owner.current || !complete) return;
    owner.current = true;
    setPending(true);
    void run(() =>
      api.respondChatInput({
        sessionId: request.sessionId,
        requestId: request.requestId,
        threadId: request.threadId,
        turnId: request.turnId,
        answers: Object.fromEntries(request.questions.map((entry) => [entry.id, [answers[entry.id] ?? '']])),
      }),
    ).finally(() => {
      owner.current = false;
      setPending(false);
    });
  };
  return (
    <section className="chat-input-panel" aria-label={t('inputRequest')} aria-busy={pending}>
      <div className="chat-input-heading" role="status">
        <CircleHelp size={15} aria-hidden="true" />
        <span>{t('inputWaiting')}</span>
      </div>
      {request.questions.length > 1 && (
        <div className="chat-input-tabs">
          {request.questions.map((entry, position) => (
            <button
              className={position === index ? 'active' : ''}
              type="button"
              key={entry.id}
              aria-current={position === index ? 'step' : undefined}
              disabled={pending}
              onClick={() => {
                setIndex(position);
              }}
            >
              {answered(entry.id) && <Check size={12} aria-hidden="true" />}
              {entry.header || String(position + 1)}
            </button>
          ))}
        </div>
      )}
      <fieldset className="chat-input-question" disabled={pending}>
        <legend>{question.question}</legend>
        {question.options.map((option) => (
          <label className="chat-input-option" key={option.label}>
            <input
              type="radio"
              name={`${groupId}:${question.id}`}
              checked={!custom[question.id] && answers[question.id] === option.label}
              onChange={() => {
                setCustom((current) => ({ ...current, [question.id]: false }));
                setAnswers((current) => ({ ...current, [question.id]: option.label }));
              }}
            />
            <span>
              <strong>{option.label}</strong>
              {option.description && <small>{option.description}</small>}
            </span>
          </label>
        ))}
        {question.isOther && question.options.length > 0 && (
          <label className="chat-input-option">
            <input
              type="radio"
              name={`${groupId}:${question.id}`}
              checked={custom[question.id] === true}
              onChange={() => {
                setCustom((current) => ({ ...current, [question.id]: true }));
                setAnswers((current) => ({ ...current, [question.id]: '' }));
              }}
            />
            <span>{t('inputOther')}</span>
          </label>
        )}
        {(question.options.length === 0 || custom[question.id]) &&
          (question.isSecret ? (
            <input
              type="password"
              autoComplete="off"
              aria-label={t('inputAnswer')}
              value={answers[question.id] ?? ''}
              maxLength={20_000}
              onChange={(event) => {
                setAnswers((current) => ({ ...current, [question.id]: event.target.value }));
              }}
            />
          ) : (
            <textarea
              aria-label={t('inputAnswer')}
              rows={2}
              maxLength={20_000}
              value={answers[question.id] ?? ''}
              onChange={(event) => {
                setAnswers((current) => ({ ...current, [question.id]: event.target.value }));
              }}
            />
          ))}
      </fieldset>
      <div className="chat-input-actions">
        {index > 0 && (
          <button
            type="button"
            className="button small"
            disabled={pending}
            onClick={() => {
              setIndex((current) => current - 1);
            }}
          >
            <ArrowLeft size={13} aria-hidden="true" />
            {t('inputBack')}
          </button>
        )}
        {index < request.questions.length - 1 ? (
          <button
            type="button"
            className="button small primary"
            disabled={pending || !answered(question.id)}
            onClick={() => {
              setIndex((current) => current + 1);
            }}
          >
            {t('inputNext')}
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="button small primary"
            disabled={pending || !complete}
            aria-busy={pending}
            title={complete ? undefined : t('inputRequired')}
            onClick={submit}
          >
            {pending ? <PendingLabel label={t('loading')} /> : t('inputContinue')}
          </button>
        )}
      </div>
    </section>
  );
}
