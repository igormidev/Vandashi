import '@hyperframes/player';
import { Clapperboard, Download, FolderOpen, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  const reported = useRef<object | null>(null);
  const mount = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ request: object | null; url: string; error: Diagnostic | null }>({
    request: null,
    url: '',
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  // The provider adopts one complete snapshot after its refresh. Its identity also
  // restarts a stopped watcher when an edit turn leaves the source revision unchanged.
  const request = useMemo(() => ({ api, workspace, attempt }), [api, workspace, attempt]);
  const url = preview.request === request ? preview.url : '';
  const error = preview.request === request ? preview.error : null;
  useEffect(() => {
    const { api, workspace } = request;
    if (!workspace?.scope.videoId) return;
    let disposed = false;
    void pending.current
      .get(request, 'preview', () => api.startStudio(workspace.scope))
      .then((studio) => {
        if (!disposed)
          setPreview({
            request,
            url: `${studio.previewUrl}${studio.previewUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(workspace.revision)}`,
            error: null,
          });
      })
      .catch((failure: unknown) => {
        if (disposed) return;
        const error = diagnosticFromBridge(failure);
        setPreview({ request, url: '', error });
        if (reported.current !== request) {
          reported.current = request;
          setToast(error);
        }
      });
    return () => {
      disposed = true;
    };
  }, [request, setToast]);
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
  useEffect(
    () =>
      api.onEvent((event) => {
        if (event.type === 'render') setProgress(event.progress);
      }),
    [api],
  );
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
          aria-busy={rendering}
          onClick={() => {
            if (!workspace) return;
            setRendering(true);
            setProgress(0);
            void run(() => api.renderVideo(workspace.scope)).finally(() => {
              setRendering(false);
            });
          }}
        >
          {rendering ? (
            <LoaderCircle size={13} className="spin" aria-hidden="true" />
          ) : (
            <Download size={13} />
          )}
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
