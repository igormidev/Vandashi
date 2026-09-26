import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scope } from '../../../domain/models';
import type { Diagnostic } from '../../../domain/diagnostics';
import { diagnosticFromBridge } from '../../../domain/diagnostics';
import type {
  AudioCategory,
  AssetCategoryChoice,
  TranscriptionPreparation,
} from '../../../domain/transcription';
import { useApp } from '../../app/store';
import { diagnosticText } from '../../app/diagnostics';
import { OwnedRequest } from '../../shared/owned-request';
import { Modal } from '../../shared/ui';
import { AudioCategoryPicker } from './AudioCategoryPicker';
import { TranscriptionStatus, useTranscriptionProgress } from './TranscriptionStatus';

/** Explicit entry preparation: passive workspace reads must never trigger model work. */
export function PrepareTranscriptions({
  scope,
  onReady,
  onDefer,
}: {
  scope: Scope | null;
  onReady: () => void;
  onDefer?: () => void;
}) {
  const { api, reload, setToast } = useApp();
  const { t } = useTranslation();
  const progress = useTranscriptionProgress();
  const pending = useRef(new OwnedRequest<TranscriptionPreparation>());
  const delivered = useRef('');
  const [attempt, setAttempt] = useState(0);
  const [choices, setChoices] = useState<AssetCategoryChoice[]>([]);
  const [selection, setSelection] = useState<Record<string, AudioCategory>>({});
  const [result, setResult] = useState<TranscriptionPreparation | null>(null);
  const [failed, setFailed] = useState<{ key: string; diagnostic: Diagnostic } | null>(null);
  const [settled, setSettled] = useState('');
  const requestKey = JSON.stringify([scope, choices, attempt]);
  const loading = settled !== requestKey;
  const failure = failed?.key === requestKey ? failed.diagnostic : null;
  useEffect(() => {
    let disposed = false;
    const request = pending.current.get(api, requestKey, async () => {
      const value = await api.prepareTranscriptions({ scope, categories: choices });
      if (value.status === 'ready' && scope) await reload(scope);
      return value;
    });
    void request
      .then((value) => {
        if (disposed || delivered.current === requestKey) return;
        delivered.current = requestKey;
        setResult(value);
        if (value.status === 'ready') onReady();
      })
      .catch((error: unknown) => {
        if (!disposed) setFailed({ key: requestKey, diagnostic: diagnosticFromBridge(error) });
      })
      .finally(() => {
        if (!disposed) setSettled(requestKey);
      });
    return () => {
      disposed = true;
    };
  }, [api, requestKey, scope, choices, reload, onReady]);
  const assets = result?.status === 'needs-classification' ? result.assets : [];
  return (
    <div className="page">
      <div className="check-list">
        <h1>{t('transcriptionPreparing')}</h1>
        {loading && <TranscriptionStatus progress={progress ?? { phase: 'checking' }} />}
        {failure && (
          <div className="form">
            <p role="alert">{diagnosticText(failure)}</p>
            <div className="toolbar">
              <button
                type="button"
                className="button"
                onClick={() => {
                  setChoices([]);
                  setSelection({});
                  setResult(null);
                  setAttempt((value) => value + 1);
                }}
              >
                {t('retry')}
              </button>
              {onDefer && (
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setToast(failure);
                    onDefer();
                  }}
                >
                  {t('brands')}
                </button>
              )}
            </div>
          </div>
        )}
        {assets.length > 0 && !loading && !failure && (
          <Modal open locked title={t('audioCategory')} onClose={() => undefined}>
            <p className="muted">{t('audioCategoryHelp')}</p>
            <div className="form transcription-choices">
              {assets.map((asset) => (
                <AudioCategoryPicker
                  key={asset.id}
                  title={asset.relativePath}
                  value={selection[asset.id] ?? ''}
                  onChange={(category) => {
                    setSelection((current) => ({ ...current, [asset.id]: category }));
                  }}
                />
              ))}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button primary"
                disabled={assets.some((asset) => !selection[asset.id])}
                onClick={() => {
                  setChoices(
                    assets.flatMap((asset) => {
                      const category = selection[asset.id];
                      return category ? [{ assetId: asset.id, revision: asset.revision, category }] : [];
                    }),
                  );
                }}
              >
                {t('continue')}
              </button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
