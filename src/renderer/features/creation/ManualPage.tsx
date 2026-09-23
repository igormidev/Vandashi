import { Clapperboard } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { diagnosticText } from '../../app/diagnostics';
import { diagnosticFromBridge, type Diagnostic } from '../../../domain/diagnostics';
import { Empty, Loading } from '../../shared/ui';
import { OwnedRequest } from '../../shared/owned-request';
import type { StudioInfo } from '../../../domain/models';

export function ManualPage() {
  const { t } = useTranslation();
  const { workspace, api, setToast, busy } = useApp();
  const pending = useRef(new OwnedRequest<StudioInfo>());
  const reported = useRef('');
  const [studio, setStudio] = useState<{ key: string; url: string; error: Diagnostic | null }>({
    key: '',
    url: '',
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  const brandId = workspace?.scope.brandId;
  const videoId = workspace?.scope.videoId;
  const clipId = workspace?.scope.clipId;
  const key = JSON.stringify([brandId, videoId, clipId, attempt]);
  useEffect(() => {
    if (!brandId || !videoId) return;
    let disposed = false;
    void pending.current
      .get(api, key, () => api.startStudio({ brandId, videoId, clipId: clipId ?? null }))
      .then((opened) => {
        if (!disposed) setStudio({ key, url: opened.url, error: null });
      })
      .catch((failure: unknown) => {
        if (disposed) return;
        const error = diagnosticFromBridge(failure);
        setStudio({ key, url: '', error });
        if (reported.current !== key) {
          reported.current = key;
          setToast(error);
        }
      });
    return () => {
      disposed = true;
    };
  }, [api, brandId, videoId, clipId, key, setToast]);
  if (studio.key === key && studio.url)
    return (
      <iframe
        className="studio-frame"
        src={studio.url}
        title={t('manual')}
        inert={busy}
        sandbox="allow-scripts allow-same-origin allow-downloads"
      />
    );
  if (studio.key === key && studio.error)
    return (
      <Empty icon={<Clapperboard size={30} />} title={t('error')} description={diagnosticText(studio.error)}>
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
      </Empty>
    );
  return <Loading label={t('studioStarting')} />;
}
