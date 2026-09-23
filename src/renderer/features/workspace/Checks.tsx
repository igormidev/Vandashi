import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { scopeKey } from '../../../domain/defaults';
import type { DependencyCheck } from '../../../domain/models';
import { useApp } from '../../app/store';
import { Split } from '../../shared/Split';
import { ChatPane } from '../chat/ChatPane';

export function Checks({ video, onReady }: { video: boolean; onReady: () => void }) {
  const { t } = useTranslation();
  const { api, workspace, reload, run, busy, setChatTarget, setToast } = useApp();
  const [checks, setChecks] = useState<DependencyCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState('Codex');
  const [attempt, setAttempt] = useState(0);
  const [repair, setRepair] = useState(false);
  const [validated, setValidated] = useState(false);
  const brandId = workspace?.scope.brandId;
  const videoId = workspace?.scope.videoId;
  const clipId = workspace?.scope.clipId;
  const scope = useMemo(
    () => (brandId ? { brandId, videoId: videoId ?? null, clipId: clipId ?? null } : null),
    [brandId, videoId, clipId],
  );

  useEffect(
    () =>
      api.onEvent((event) => {
        if (
          event.type !== 'checks' ||
          event.video !== video ||
          (event.scope ? scopeKey(event.scope) : '') !== (scope ? scopeKey(scope) : '')
        )
          return;
        setChecks(event.checks);
        setProgress(event.progress);
        setCurrent(event.current);
      }),
    [api, scope, video],
  );
  useEffect(() => {
    let cancelled = false;
    void api
      .checks({ scope, video })
      .then(async (value) => {
        if (scope && value.every((check) => check.status === 'ready')) await reload(scope);
        if (cancelled) return;
        setChecks(value);
        setValidated(true);
        setProgress(1);
        if (attempt > 0 && value.some((check) => check.status !== 'ready')) setToast(t('checkStillMissing'));
      })
      .catch((error: unknown) => {
        if (!cancelled)
          void run(() => Promise.reject(error instanceof Error ? error : new Error(String(error))));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, scope, video, attempt, reload, run, setToast, t]);
  const ready =
    !loading && validated && checks.length > 0 && checks.every((check) => check.status === 'ready');
  useEffect(() => {
    if (ready) {
      setChatTarget(null);
      onReady();
    }
  }, [ready, onReady, setChatTarget]);
  const content = (
    <div className="page">
      <div className="check-list">
        <h1>{t('checking')}</h1>
        <div className="check-heading">
          <span>{loading ? t('checkingTool', { tool: current }) : t('dependencyMissing')}</span>
          <span className="mono">{t('checkPercent', { count: Math.round(progress * 100) })}</span>
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
              <h3>{check.id}</h3>
              <p>{check.detail}</p>
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
                          title: check.id,
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
                setLoading(true);
                setValidated(false);
                setProgress(0);
                setChecks([]);
                setAttempt(attempt + 1);
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
