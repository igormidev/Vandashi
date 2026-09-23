import { CircleAlert, Film } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { Empty, Loading } from '../../shared/ui';

export function ClipPlayer({
  path,
  name,
  ratio,
  autoPlay = false,
  playRequest = 0,
}: {
  path: string | null;
  name: string;
  ratio: string;
  autoPlay?: boolean;
  playRequest?: number;
}) {
  const { api, run } = useApp();
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let active = true;
    if (!path) return;
    void run(async () => {
      const result = await api.mediaUrl(path);
      if (active) setUrl(result);
    });
    return () => {
      active = false;
    };
  }, [api, path, run]);
  useEffect(() => {
    const element = player.current;
    if (autoPlay && url && element) void run(() => element.play());
  }, [autoPlay, playRequest, url, run]);
  if (!path) return <Empty icon={<Film size={32} />} title={t('clipNoRender')} />;
  if (failed) return <Empty icon={<CircleAlert size={28} />} title={t('clipMediaError')} />;
  if (!url) return <Loading />;
  return (
    <div className={`clip-player ${ratio === '1:1' ? 'square' : 'portrait'}`}>
      <video
        ref={player}
        src={url}
        controls
        preload="metadata"
        autoPlay={autoPlay}
        aria-label={name}
        onError={() => {
          setFailed(true);
        }}
      >
        <track kind="captions" />
      </video>
    </div>
  );
}
