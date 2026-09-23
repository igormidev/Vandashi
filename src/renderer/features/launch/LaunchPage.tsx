import { ArrowLeft, Scissors, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Platform } from '../../../domain/models';
import { horizontalPlatforms, verticalPlatforms } from '../../../domain/launch';
import { useApp } from '../../app/store';
import { IconButton } from '../../shared/ui';
import { Split } from '../../shared/Split';
import { ChatPane } from '../chat/ChatPane';
import { LaunchRow } from './LaunchRow';
import { PublishReview } from './PublishReview';
import type { ReleaseDraft } from './release-draft';
import '../../styles/launch.css';

export function LaunchPage({ onCreateClips }: { onCreateClips: () => void }) {
  const { t } = useTranslation();
  const { workspace, api, run, busy, dirty, setChatTarget, reload } = useApp();
  const [selected, setSelected] = useState<Platform | null>(null);
  const [draft, setDraft] = useState<ReleaseDraft | null>(null);
  const [chat, setChat] = useState(false);
  const [importing, setImporting] = useState(false);
  if (!workspace?.video) return null;
  const video = workspace.video;
  const landscape = video.ratio === '16:9';
  const choose = (platform: Platform, clipId: string | null = null) => {
    setSelected(platform);
    setChat(false);
    const source = clipId ? workspace.clips.find((clip) => clip.id === clipId) : video;
    if (!source || (!clipId && landscape && verticalPlatforms.includes(platform))) {
      setDraft(null);
      return;
    }
    setDraft({
      platform,
      clipId,
      source,
      packaging: structuredClone(source.packaging),
      chapters: [],
      browser:
        workspace.brand.config.platforms[platform === 'youtubeShorts' ? 'youtube' : platform]?.browser ?? '',
    });
  };
  const back = () => {
    setSelected(null);
    setDraft(null);
    setChat(false);
    setChatTarget(null);
  };
  const lock = busy || dirty || importing;
  if (selected && !draft)
    return (
      <div className="page launch-review">
        <div className="page-header">
          <div className="toolbar">
            <IconButton label={t('back')} disabled={lock} onClick={back}>
              <ArrowLeft size={17} />
            </IconButton>
            <h1>{t(selected)}</h1>
          </div>
        </div>
        <h2>{t('chooseClip')}</h2>
        {workspace.clips.length ? (
          workspace.clips.map((clip) => (
            <button
              type="button"
              className="clip-pick"
              key={clip.id}
              disabled={lock || !clip.renderedPath}
              onClick={() => {
                choose(selected, clip.id);
              }}
            >
              <span>{clip.name}</span>
              <span className="badge">{clip.renderedPath ? clip.ratio : t('launchClipNeedsRender')}</span>
            </button>
          ))
        ) : (
          <p className="muted">{t('noClipsForUpload')}</p>
        )}
        <div className="toolbar">
          <button
            className="button"
            type="button"
            disabled={lock}
            onClick={() => {
              setImporting(true);
              void run(async () => {
                try {
                  const sourcePath = (await api.chooseFiles('video'))[0];
                  if (!sourcePath) return;
                  const clip = await api.importFinishedClip({ scope: workspace.scope, sourcePath });
                  await reload();
                  setDraft({
                    platform: selected,
                    clipId: clip.id,
                    source: clip,
                    packaging: structuredClone(clip.packaging),
                    chapters: [],
                    browser:
                      workspace.brand.config.platforms[selected === 'youtubeShorts' ? 'youtube' : selected]
                        ?.browser ?? '',
                  });
                } finally {
                  setImporting(false);
                }
              });
            }}
          >
            <Upload size={14} />
            {t(importing ? 'loading' : 'importVideo')}
          </button>
          <button className="button primary" type="button" disabled={lock} onClick={onCreateClips}>
            <Scissors size={14} />
            {t('goClips')}
          </button>
        </div>
      </div>
    );
  if (draft) {
    const review = (
      <PublishReview
        draft={draft}
        onChange={setDraft}
        onBack={back}
        onPrepared={() => {
          setChat(true);
        }}
      />
    );
    return chat ? <Split id="launch" left={<ChatPane />} right={review} /> : review;
  }
  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('launch')}</h1>
      </div>
      <div className={`launch-columns ${landscape ? '' : 'single'}`}>
        <section>
          <h2>{t('shortForm')}</h2>
          {verticalPlatforms.map((platform) => (
            <div className="launch-platform-group" key={platform}>
              {landscape ? (
                <>
                  <LaunchRow
                    platform={platform}
                    clipId={null}
                    headingOnly
                    onPublish={() => {
                      choose(platform);
                    }}
                  />
                  {workspace.clips.map((clip) => (
                    <LaunchRow
                      key={clip.id}
                      platform={platform}
                      clipId={clip.id}
                      label={clip.name}
                      rendered={!!clip.renderedPath}
                      onPublish={() => {
                        choose(platform, clip.id);
                      }}
                    />
                  ))}
                </>
              ) : (
                <LaunchRow
                  platform={platform}
                  clipId={null}
                  rendered={!!video.renderedPath}
                  onPublish={() => {
                    choose(platform);
                  }}
                />
              )}
            </div>
          ))}
        </section>
        {landscape && (
          <section>
            <h2>{t('longForm')}</h2>
            {horizontalPlatforms.map((platform) => (
              <LaunchRow
                key={platform}
                platform={platform}
                clipId={null}
                rendered={!!video.renderedPath}
                onPublish={() => {
                  choose(platform);
                }}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
