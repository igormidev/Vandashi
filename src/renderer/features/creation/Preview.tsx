import '@hyperframes/player';
import { Clapperboard, Download, FolderOpen, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { diagnosticText } from '../../app/diagnostics';
import { diagnosticFromBridge, type Diagnostic } from '../../../domain/diagnostics';
import { Empty, IconButton } from '../../shared/ui';
import { formatPercent } from '../../shared/format';
import { OwnedRequest } from '../../shared/owned-request';
import type { StudioInfo } from '../../../domain/models';

export function Preview({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const { workspace, api, run, busy, dirty, setToast } = useApp();
  const pending = useRef(new OwnedRequest<StudioInfo>());
  const reported = useRef('');
  const mount = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ key: string; url: string; error: Diagnostic | null }>({
    key: '',
    url: '',
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const brandId = workspace?.scope.brandId;
  const videoId = workspace?.scope.videoId;
  const clipId = workspace?.scope.clipId;
  const revision = workspace?.revision;
  const key = `${brandId ?? ''}/${videoId ?? ''}/${clipId ?? ''}/${revision ?? ''}`;
  const requestKey = JSON.stringify([key, attempt]);
  const url = preview.key === requestKey ? preview.url : '';
  const error = preview.key === requestKey ? preview.error : null;
  useEffect(() => {
    if (!brandId || !videoId) return;
    let disposed = false;
    void pending.current
      .get(api, requestKey, () => api.startStudio({ brandId, videoId, clipId: clipId ?? null }))
      .then((studio) => {
        if (!disposed)
          setPreview({
            key: requestKey,
            url: `${studio.previewUrl}${studio.previewUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(revision ?? '')}`,
            error: null,
          });
      })
      .catch((failure: unknown) => {
        if (disposed) return;
        const error = diagnosticFromBridge(failure);
        setPreview({ key: requestKey, url: '', error });
        if (reported.current !== requestKey) {
          reported.current = requestKey;
          setToast(error);
        }
      });
    return () => {
      disposed = true;
    };
  }, [api, brandId, videoId, clipId, revision, requestKey, setToast]);
  useEffect(() => {
    if (!mount.current || !url) return;
    const player = document.createElement('hyperframes-player');
    player.setAttribute('src', url);
    player.setAttribute('controls', '');
    player.style.width = '100%';
    player.style.height = '100%';
    mount.current.append(player);
    return () => {
      player.remove();
    };
  }, [url]);
  useEffect(() => {
    let disposed = false;
    const unsubscribe = api.onEvent((event) => {
      if (event.type === 'render') setProgress(event.progress);
      if (
        event.type === 'workspace-changed' &&
        event.scope.brandId === brandId &&
        event.scope.videoId === videoId &&
        event.scope.clipId === clipId
      ) {
        // Edit turns stop the watcher. Even a turn with no file changes needs a fresh server URL.
        void run(async () => {
          await api.openWorkspace(event.scope);
          if (!disposed) setAttempt((value) => value + 1);
        });
      }
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [api, brandId, videoId, clipId, run]);
  return (
    <section className={`preview-section ${compact ? 'compact' : ''}`}>
      <div className="preview-heading">
        <span className="eyebrow">{t('preview')}</span>
        <span className="badge">{workspace?.video?.ratio}</span>
        <div className="spacer" />
        {workspace?.video?.renderedPath && (
          <IconButton
            label={t('reveal')}
            disabled={busy}
            onClick={() => {
              const path = workspace.video?.renderedPath;
              if (path) void run(() => api.revealPath(path));
            }}
          >
            <FolderOpen size={14} />
          </IconButton>
        )}
        <button
          className="button small"
          type="button"
          disabled={busy || dirty || rendering || workspace?.dirty}
          onClick={() => {
            if (!workspace) return;
            setRendering(true);
            setProgress(0);
            void run(() => api.renderVideo(workspace.scope)).finally(() => {
              setRendering(false);
            });
          }}
        >
          {rendering ? <LoaderCircle size={13} className="spin" /> : <Download size={13} />}
          {rendering
            ? t('renderingProgress', { percent: formatPercent(progress / 100, i18n.language) })
            : t('render')}
        </button>
      </div>
      <div
        className={`preview-stage ${workspace?.video?.ratio === '9:16' ? 'vertical' : ''}`}
        style={{ aspectRatio: workspace?.video?.ratio.replace(':', '/') }}
      >
        {url ? (
          <div className="player-mount" ref={mount} />
        ) : (
          <Empty
            icon={
              error ? <Clapperboard size={35} strokeWidth={1} /> : <LoaderCircle size={28} className="spin" />
            }
            title={t(error ? 'noPreview' : 'studioStarting')}
            description={error ? diagnosticText(error) : t('noPreviewHelp')}
          >
            {error && (
              <button
                className="button small"
                disabled={busy}
                type="button"
                onClick={() => {
                  setAttempt((value) => value + 1);
                }}
              >
                {t('retry')}
              </button>
            )}
          </Empty>
        )}
      </div>
    </section>
  );
}
