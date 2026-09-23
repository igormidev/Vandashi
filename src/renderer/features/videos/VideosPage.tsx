import { Clapperboard, Plus, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VideoSummary, Workspace } from '../../../domain/models';
import { useApp } from '../../app/store';
import { Empty, InfoTip, Modal } from '../../shared/ui';
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
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [preflight, setPreflight] = useState(false);
  const [create, setCreate] = useState(false);
  const [name, setName] = useState('');
  const [ratio, setRatio] = useState<'16:9' | '9:16'>('16:9');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (workspace)
      void run(async () => {
        setVideos(await api.listVideos(workspace.scope.brandId));
      });
  }, [api, workspace, run]);
  if (!workspace) return null;
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
            disabled={busy || dirty}
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
            disabled={busy || dirty}
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
      {videos.length ? (
        <div className="video-grid">
          {videos.map((video) => (
            <VideoTile
              key={video.id}
              video={video}
              onOpen={() => {
                void run(async () => {
                  onOpen(
                    await api.openWorkspace({
                      brandId: workspace.scope.brandId,
                      videoId: video.id,
                      clipId: null,
                    }),
                  );
                });
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
              onOpen(await api.createVideo({ brandId: workspace.scope.brandId, name, ratio }));
              setCreate(false);
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
              <div className="ratio-options">
                {(['16:9', '9:16'] as const).map((option) => (
                  <button
                    type="button"
                    key={option}
                    disabled={loading}
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
            <button type="submit" className="button primary" disabled={loading || name.trim().length < 3}>
              {t(loading ? 'loading' : 'create')}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
function VideoTile({ video, onOpen }: { video: VideoSummary; onOpen: () => void }) {
  const { t } = useTranslation();
  const { api, run } = useApp();
  const [url, setUrl] = useState('');
  useEffect(() => {
    const image = video.packaging.thumbnails[0];
    if (image)
      void run(async () => {
        setUrl(await api.mediaUrl(`${video.path}/${image}`));
      });
  }, [api, run, video]);
  return (
    <div className="video-tile">
      <button type="button" className="video-tile" onClick={onOpen}>
        <div className="video-cover">
          {url ? <img src={url} alt={video.name} /> : <Clapperboard size={35} strokeWidth={1} />}
        </div>
        <h2>{video.name}</h2>
      </button>
      {video.packaging.theme && <ExpandableText text={video.packaging.theme} />}
      <div className="video-meta">
        <span>{video.ratio}</span>
        {video.origin === 'imported' && <span>{t('importedVideo')}</span>}
        <span>{new Date(video.updatedAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
