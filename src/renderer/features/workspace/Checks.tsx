import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { scopeKey } from '../../../domain/defaults';
import type { DependencyCheck } from '../../../domain/models';
import type { AppMessage } from '../../../domain/messages';
import { useApp } from '../../app/store';
import { diagnosticText, messageText } from '../../app/diagnostics';
import { Split } from '../../shared/Split';
import { formatPercent } from '../../shared/format';
import { ChatPane } from '../chat/ChatPane';
import { OwnedRequest } from '../../shared/owned-request';

interface CheckProgress {
  key: string;
  checks: DependencyCheck[];
  progress: number;
  current: string;
  currentLabel?: AppMessage;
}

export function Checks({ video, onReady }: { video: boolean; onReady: () => void }) {
  const { t, i18n } = useTranslation();
  const { api, workspace, reload, run, busy, setChatTarget, setToast } = useApp();
  const [feedback, setFeedback] = useState<CheckProgress>({
    key: '',
    checks: [],
    progress: 0,
    current: 'Codex',
  });
  const [settled, setSettled] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [repair, setRepair] = useState(false);
  const [validated, setValidated] = useState('');
  const pending = useRef(new OwnedRequest<DependencyCheck[]>());
  const delivered = useRef('');
  const readyDelivered = useRef('');
  const brandId = workspace?.scope.brandId;
  const videoId = workspace?.scope.videoId;
  const clipId = workspace?.scope.clipId;
  const scope = useMemo(
    () => (brandId ? { brandId, videoId: videoId ?? null, clipId: clipId ?? null } : null),
    [brandId, videoId, clipId],
  );
  const requestKey = JSON.stringify([scope ? scopeKey(scope) : null, video, attempt]);
  const { checks, progress, current, currentLabel } =
    feedback.key === requestKey
      ? feedback
      : { checks: [], progress: 0, current: 'Codex', currentLabel: undefined };
  const loading = settled !== requestKey;

  useEffect(
    () =>
      api.onEvent((event) => {
        if (
          event.type !== 'checks' ||
          event.video !== video ||
          (event.scope ? scopeKey(event.scope) : '') !== (scope ? scopeKey(scope) : '')
        )
          return;
        setFeedback({
          key: requestKey,
          checks: event.checks,
          progress: event.progress,
          current: event.current,
          ...(event.currentLabel ? { currentLabel: event.currentLabel } : {}),
        });
      }),
    [api, scope, video, requestKey],
  );
  useEffect(() => {
    let cancelled = false;
    const request = pending.current.get(api, requestKey, async () => {
      const value = await api.checks({ scope, video });
      if (scope && value.every((check) => check.status === 'ready')) await reload(scope);
      return value;
    });
    void request
      .then((value) => {
        if (cancelled || delivered.current === requestKey) return;
        delivered.current = requestKey;
        setFeedback({ key: requestKey, checks: value, progress: 1, current: '' });
        setValidated(requestKey);
        if (attempt > 0 && value.some((check) => check.status !== 'ready'))
          setToast({ kind: 'interface', key: 'checkStillMissing' });
      })
      .catch((error: unknown) => {
        if (!cancelled && delivered.current !== requestKey) {
          delivered.current = requestKey;
          void run(() => Promise.reject(error instanceof Error ? error : new Error(String(error))));
        }
      })
      .finally(() => {
        if (!cancelled) setSettled(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [api, scope, video, attempt, requestKey, reload, run, setToast]);
  const ready =
    !loading &&
    validated === requestKey &&
    checks.length > 0 &&
    checks.every((check) => check.status === 'ready');
  useEffect(() => {
    if (ready && readyDelivered.current !== requestKey) {
      readyDelivered.current = requestKey;
      setChatTarget(null);
      onReady();
    }
  }, [ready, requestKey, onReady, setChatTarget]);
  const content = (
    <div className="page">
      <div className="check-list">
        <h1>{t('checking')}</h1>
        <div className="check-heading">
          <span>
            {loading
              ? t('checkingTool', { tool: currentLabel ? messageText(currentLabel) : current })
              : t('dependencyMissing')}
          </span>
          <span className="mono">{formatPercent(progress, i18n.language)}</span>
        </div>
        <div
          className="check-progress"
          role="progressbar"
          aria-label={t('checking')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div style={{ width: `${String(progress * 100)}%` }} />
        </div>
        {checks.map((check) => (
          <div className="check-item" key={check.id}>
            <span className={`check-icon ${check.status !== 'ready' ? 'bad' : ''}`}>
              {check.status === 'ready' ? <Check size={19} /> : <CircleAlert size={19} />}
            </span>
            <div>
              <h3>{check.label ? messageText(check.label) : check.id}</h3>
              <p>{check.diagnostic ? diagnosticText(check.diagnostic) : check.detail}</p>
              {check.status !== 'ready' && (
                <div className="toolbar">
                  {check.helpUrl && (
                    <button
                      className="button small"
                      type="button"
                      onClick={() => {
                        if (check.helpUrl) void run(() => api.openExternal(check.helpUrl ?? ''));
                      }}
                    >
                      {t('installHelp')}
                    </button>
                  )}
                  {check.repairPrompt && workspace && (
                    <button
                      className="button small"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setChatTarget({
                          topic: `repair:${check.id}`,
                          title: check.label ? messageText(check.label) : check.id,
                          prompt: check.repairPrompt ?? '',
                        });
                        setRepair(true);
                      }}
                    >
                      {t('repairAi')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="loading">
            <LoaderCircle className="spin" size={20} />
            <span>{t('loading')}</span>
          </div>
        )}
        {!loading && (
          <div className="check-bottom">
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() => {
                setAttempt((value) => value + 1);
              }}
            >
              {t('retry')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
  return repair ? <Split id="dependencies" left={<ChatPane />} right={content} /> : content;
}
