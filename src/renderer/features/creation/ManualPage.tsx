import { Clapperboard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { errorText } from '../../app/diagnostics';
import { Empty, Loading } from '../../shared/ui';

export function ManualPage() {
  const { t } = useTranslation();
  const { workspace, api, run, busy } = useApp();
  const [studio, setStudio] = useState({ key: '', url: '', error: '' });
  const [attempt, setAttempt] = useState(0);
  const brandId = workspace?.scope.brandId;
  const videoId = workspace?.scope.videoId;
  const clipId = workspace?.scope.clipId;
  const key = `${brandId ?? ''}/${videoId ?? ''}/${clipId ?? ''}`;
  useEffect(() => {
    if (!brandId || !videoId) return;
    let disposed = false;
    void run(async () => {
      try {
        const opened = await api.startStudio({ brandId, videoId, clipId: clipId ?? null });
        if (!disposed) setStudio({ key, url: opened.url, error: '' });
      } catch (failure) {
        if (!disposed) setStudio({ key, url: '', error: errorText(failure) });
        throw failure;
      }
    });
    return () => {
      disposed = true;
    };
  }, [api, brandId, videoId, clipId, key, attempt, run]);
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
      <Empty icon={<Clapperboard size={30} />} title={t('error')} description={studio.error}>
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
