import { Clapperboard, Plus, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VideoSummary, Workspace } from '../../../domain/models';
import { diagnosticFromBridge, type Diagnostic } from '../../../domain/diagnostics';
import { useApp } from '../../app/store';
import { diagnosticText } from '../../app/diagnostics';
import { Empty, InfoTip, Loading, Modal, PendingLabel } from '../../shared/ui';
import { OwnedRequest } from '../../shared/owned-request';
import { Checks } from '../workspace/Checks';
import { PlatformIcon } from '../../shared/PlatformIcon';
import { ExpandableText } from '../../shared/ExpandableText';
import { ImportVideoDialog } from './ImportVideoDialog';

export function VideosPage({
  onOpen,
}: {
  onOpen: (workspace: Workspace, destination?: 'packaging' | 'launch') => void;
}) {
  const { t } = useTranslation();
  const { api, workspace, run, busy, dirty } = useApp();
  const [importing, setImporting] = useState(false);
  const pending = useRef(new OwnedRequest<VideoSummary[]>());
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<{
    request: object | null;
    videos: VideoSummary[];
    error: Diagnostic | null;
  }>({ request: null, videos: [], error: null });
  const request = useMemo(() => ({ api, workspace, attempt }), [api, workspace, attempt]);
  const listLoading = list.request !== request;
  const opening = useRef<object | null>(null);
  const [selection, setSelection] = useState<{
    owner: object;
    video: string;
    error: Diagnostic | null;
  } | null>(null);
  const selected = selection?.owner === request ? selection : null;
  const selecting = selected !== null && selected.error === null;
  const [preflight, setPreflight] = useState(false);
  const [create, setCreate] = useState(false);
  const [name, setName] = useState('');
  const [ratio, setRatio] = useState<'16:9' | '9:16'>('16:9');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const { api, workspace } = request;
    if (!workspace) return;
    let disposed = false;
    void pending.current
      .get(request, 'videos', () => api.listVideos(workspace.scope.brandId))
      .then((videos) => {
        if (!disposed) setList({ request, videos, error: null });
      })
      .catch((error: unknown) => {
        if (!disposed) setList({ request, videos: [], error: diagnosticFromBridge(error) });
      });
    return () => {
      disposed = true;
      opening.current = null;
    };
  }, [request]);
  if (!workspace) return null;
  const select = async (video: string) => {
    if (opening.current) return;
    const token = {};
    opening.current = token;
    setSelection({ owner: request, video, error: null });
    try {
      const result = await api.openWorkspace({
        brandId: workspace.scope.brandId,
        videoId: video,
        clipId: null,
      });
      if (opening.current === token) onOpen(result);
    } catch (error) {
      if (opening.current === token)
        setSelection({ owner: request, video, error: diagnosticFromBridge(error) });
    } finally {
      if (opening.current === token) opening.current = null;
    }
  };
  if (preflight)
    return (
      <Checks
        video
        onReady={() => {
          setPreflight(false);
          setCreate(true);
        }}
      />
    );
  return (
    <main className="page">
      <div className="page-header">
        <h1>{t('videos')}</h1>
        <div className="toolbar">
          <button
            type="button"
            className="button"
            disabled={busy || dirty || listLoading || selecting}
            onClick={() => {
              setImporting(true);
            }}
          >
            <Upload size={15} />
            {t('importFinishedVideo')}
          </button>
          <button
            className="button primary"
            type="button"
            disabled={busy || dirty || listLoading || selecting}
            onClick={() => {
              setName('');
              setPreflight(true);
            }}
          >
            <Plus size={15} />
            {t('createVideo')}
          </button>
        </div>
      </div>
      {selecting && <Loading />}
      {selected?.error && (
        <div className="field-error" role="alert">
          <p>{diagnosticText(selected.error)}</p>
          <button
            className="button small"
            type="button"
            disabled={busy || dirty}
            onClick={() => {
              void select(selected.video);
            }}
          >
            {t('retry')}
          </button>
        </div>
      )}
      {listLoading ? (
        <Loading />
      ) : list.error ? (
        <div className="field-error" role="alert">
          <p>{diagnosticText(list.error)}</p>
          <button
            className="button small"
            type="button"
            disabled={busy || dirty}
            onClick={() => {
              setAttempt((value) => value + 1);
            }}
          >
            {t('retry')}
          </button>
        </div>
      ) : list.videos.length ? (
        <div className="video-grid">
          {list.videos.map((video) => (
            <VideoTile
              key={video.id}
              video={video}
              locked={selecting}
              onOpen={() => {
                void select(video.id);
              }}
            />
          ))}
        </div>
      ) : (
        <Empty
          icon={<Clapperboard size={36} strokeWidth={1} />}
          title={t('noVideos')}
          description={t('noVideosHelp')}
        />
      )}
      {importing && (
        <ImportVideoDialog
          brandId={workspace.scope.brandId}
          onClose={() => {
            setImporting(false);
          }}
          onOpen={onOpen}
        />
      )}
      <Modal
        title={t('createVideo')}
        open={create}
        locked={loading}
        onClose={() => {
          if (!loading) setCreate(false);
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setLoading(true);
            void run(async () => {
              try {
                onOpen(await api.createVideo({ brandId: workspace.scope.brandId, name, ratio }));
                setCreate(false);
              } catch (error) {
                const diagnostic = diagnosticFromBridge(error);
                if (diagnostic.kind === 'app' && diagnostic.message.id === 'storageCreatedVideoUnavailable') {
                  setCreate(false);
                  setAttempt((value) => value + 1);
                }
                throw error;
              }
            }).finally(() => {
              setLoading(false);
            });
          }}
        >
          <div className="form">
            <label className="field" htmlFor="video-name" aria-label={t('videoName')}>
              <span className="field-label">
                <span>
                  {t('videoName')}
                  <InfoTip text={t('videoNameHelp')} />
                </span>
              </span>
              <input
                id="video-name"
                disabled={loading}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder={t('videoNameHint')}
                minLength={3}
                maxLength={100}
                required
              />
            </label>
            <div className="field">
              <span>{t('aspectRatio')}</span>
              <div className="ratio-options" role="group" aria-label={t('aspectRatio')}>
                {(['16:9', '9:16'] as const).map((option) => (
                  <button
                    type="button"
                    key={option}
                    disabled={loading}
                    aria-pressed={ratio === option}
                    className={`ratio-option ${ratio === option ? 'selected' : ''}`}
                    onClick={() => {
                      setRatio(option);
                    }}
                  >
                    <span className={`ratio-shape ${option === '9:16' ? 'vertical' : ''}`} />
                    <span className="ratio-label">
                      {t(option === '16:9' ? 'landscape' : 'portrait')}
                      <small>{option}</small>
                      <span className="ratio-platforms">
                        {(option === '16:9'
                          ? (['youtube', 'rumble', 'odysee'] as const)
                          : (['youtubeShorts', 'tiktok', 'instagram', 'facebook'] as const)
                        ).map((platform) => (
                          <PlatformIcon key={platform} platform={platform} />
                        ))}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button"
              disabled={loading}
              onClick={() => {
                setCreate(false);
              }}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={loading || name.trim().length < 3}
              aria-busy={loading}
            >
              {loading ? <PendingLabel label={t('loading')} /> : t('create')}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
function VideoTile({ video, onOpen, locked }: { video: VideoSummary; onOpen: () => void; locked: boolean }) {
  const { t, i18n } = useTranslation();
  const { api, busy, dirty } = useApp();
  const pending = useRef(new OwnedRequest<string>());
  const request = useMemo(() => ({ api, video }), [api, video]);
  const [image, setImage] = useState<{ request: object | null; url: string }>({ request: null, url: '' });
  const url = image.request === request ? image.url : '';
  useEffect(() => {
    const { api, video } = request;
    const image = video.packaging.thumbnails[0];
    if (!image) return;
    let disposed = false;
    void pending.current
      .get(request, 'thumbnail', () => api.mediaUrl(`${video.path}/${image}`))
      .then((url) => {
        if (!disposed) setImage({ request, url });
      })
      .catch(() => {
        if (!disposed) setImage({ request, url: '' });
      });
    return () => {
      disposed = true;
    };
  }, [request]);
  return (
    <div className="video-tile">
      <button type="button" className="video-tile" disabled={busy || dirty || locked} onClick={onOpen}>
        <div className="video-cover">
          {url ? (
            <img
              src={url}
              alt=""
              onError={() => {
                setImage((current) => (current.request === request ? { request, url: '' } : current));
              }}
            />
          ) : (
            <Clapperboard size={35} strokeWidth={1} />
          )}
        </div>
        <h2>{video.name}</h2>
      </button>
      {video.packaging.theme && <ExpandableText text={video.packaging.theme} />}
      <div className="video-meta">
        <span>{video.ratio}</span>
        {video.origin === 'imported' && <span>{t('importedVideo')}</span>}
        <span>{new Date(video.updatedAt).toLocaleDateString(i18n.language)}</span>
      </div>
    </div>
  );
}
