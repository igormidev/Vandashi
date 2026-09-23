import { AudioLines, File, Image, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Asset, AssetKind } from '../../../domain/models';
import { useApp } from '../../app/store';

export function AssetTypeIcon({ kind, size = 20 }: { kind: AssetKind; size?: number }) {
  if (kind === 'image') return <Image size={size} />;
  if (kind === 'video') return <Video size={size} />;
  if (kind === 'audio') return <AudioLines size={size} />;
  return <File size={size} />;
}

function AudioWaveform({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const { api, workspace } = useApp();
  const [peaks, setPeaks] = useState<number[]>([]);
  const brandId = workspace?.scope.brandId;
  const videoId = workspace?.scope.videoId ?? null;
  const clipId = workspace?.scope.clipId ?? null;
  useEffect(() => {
    if (!brandId) return;
    let disposed = false;
    void api
      .assetWaveform({ scope: { brandId, videoId, clipId }, assetId: asset.id })
      .then((values) => {
        if (!disposed) setPeaks(values);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [api, brandId, videoId, clipId, asset.id, asset.hash]);
  return (
    <div
      className="asset-waveform"
      role="img"
      aria-label={t(peaks.length ? 'assetWaveform' : 'assetWaveformUnavailable')}
    >
      {peaks.length ? (
        <svg viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true">
          {peaks.map((peak, index) => (
            <rect key={index} x={index * 3} y={35 - peak * 30} width={2} height={peak * 60} rx={1} />
          ))}
        </svg>
      ) : (
        <AudioLines size={48} strokeWidth={1} />
      )}
    </div>
  );
}

export function AssetPreview({ asset, compact = false }: { asset: Asset; compact?: boolean }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="asset-no-preview">
        <AssetTypeIcon kind={asset.kind} size={28} />
        {!compact && <span>{t('assetPreviewUnavailable')}</span>}
      </div>
    );
  if (asset.kind === 'image')
    return (
      <img
        src={asset.mediaUrl}
        alt={asset.title}
        loading="lazy"
        onError={() => {
          setFailed(true);
        }}
      />
    );
  if (asset.kind === 'video')
    return compact ? (
      <div className="asset-video-thumb">
        <video
          src={asset.mediaUrl}
          muted
          preload="metadata"
          aria-label={asset.title}
          onError={() => {
            setFailed(true);
          }}
        />
        <Video size={17} />
      </div>
    ) : (
      <video
        src={asset.mediaUrl}
        controls
        preload="metadata"
        aria-label={asset.title}
        onError={() => {
          setFailed(true);
        }}
      >
        <track kind="captions" />
      </video>
    );
  if (asset.kind === 'audio' && !compact)
    return (
      <div className="asset-audio">
        <AudioWaveform asset={asset} />
        <audio
          src={asset.mediaUrl}
          controls
          preload="metadata"
          aria-label={asset.title}
          onError={() => {
            setFailed(true);
          }}
        >
          <track kind="captions" />
        </audio>
      </div>
    );
  return (
    <div className={`asset-no-preview asset-kind-${asset.kind}`}>
      <AssetTypeIcon kind={asset.kind} size={compact ? 34 : 48} />
      {!compact && <span>{t('assetPreviewUnavailable')}</span>}
    </div>
  );
}
