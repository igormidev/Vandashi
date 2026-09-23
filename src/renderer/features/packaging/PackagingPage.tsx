import { ArrowLeft, ArrowRight, ImagePlus, RotateCcw } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { AiButton, IconButton, InfoTip } from '../../shared/ui';
import { CommitDialog } from '../history/CommitDialog';
import { TagsInput } from '../../shared/TagsInput';

export function PackagingPage() {
  const { t } = useTranslation();
  const tagsId = useId();
  const { workspace, api, run, busy, setDirty, setWorkspace, setChatTarget } = useApp();
  const [packaging, setPackaging] = useState(workspace?.video?.packaging);
  const [format, setFormat] = useState<'long' | 'short'>(
    workspace?.video?.ratio === '16:9' ? 'long' : 'short',
  );
  const [confirm, setConfirm] = useState(false);
  const dirty = JSON.stringify(packaging) !== JSON.stringify(workspace?.video?.packaging);
  useEffect(() => {
    setDirty(dirty);
    return () => {
      setDirty(false);
    };
  }, [dirty, setDirty]);
  if (!workspace?.video || !packaging) return null;
  const move = (index: number, direction: number) => {
    const list = [...packaging.thumbnails];
    const entry = list.splice(index, 1)[0];
    if (entry) list.splice(index + direction, 0, entry);
    setPackaging({ ...packaging, thumbnails: list });
  };
  return (
    <>
      <div className="panel-scroll">
        <fieldset disabled={busy}>
          <div className="section-title">
            <h2>{t('packaging')}</h2>
          </div>
          <div className="chip-scroll">
            {(['long', 'short'] as const).map((entry) => (
              <button
                className={`chip ${entry === format ? 'active' : ''}`}
                type="button"
                key={entry}
                onClick={() => {
                  setFormat(entry);
                }}
              >
                {t(entry === 'long' ? 'longForm' : 'shortForm')}
              </button>
            ))}
          </div>
          <div className="form">
            <label className="field">
              <span className="field-label">
                <span>{t('theme')}</span>
                <AiButton
                  disabled={dirty}
                  onClick={() => {
                    setChatTarget({ topic: 'packaging:theme', title: t('theme') });
                  }}
                />
              </span>
              <textarea
                aria-label={t('theme')}
                rows={2}
                value={packaging.theme}
                onChange={(event) => {
                  setPackaging({ ...packaging, theme: event.target.value });
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">
                <span>
                  {t('titles')}
                  <InfoTip text={t('titlesHint')} />
                </span>
                <AiButton
                  disabled={dirty}
                  onClick={() => {
                    setChatTarget({
                      topic: `packaging:title:${format}`,
                      title: t(format === 'long' ? 'titleLong' : 'titleShort'),
                    });
                  }}
                />
              </span>
              <textarea
                aria-label={t('titles')}
                rows={3}
                value={packaging.titles[format].join('\n')}
                onChange={(event) => {
                  setPackaging({
                    ...packaging,
                    titles: { ...packaging.titles, [format]: event.target.value.split('\n') },
                  });
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">
                <span>{t('description')}</span>
                <AiButton
                  disabled={dirty}
                  onClick={() => {
                    setChatTarget({
                      topic: `packaging:description:${format}`,
                      title: t(format === 'long' ? 'descriptionLong' : 'descriptionShort'),
                    });
                  }}
                />
              </span>
              <textarea
                aria-label={t('description')}
                rows={6}
                value={packaging.descriptions[format]}
                onChange={(event) => {
                  setPackaging({
                    ...packaging,
                    descriptions: { ...packaging.descriptions, [format]: event.target.value },
                  });
                }}
              />
            </label>
            <label className="field" htmlFor={tagsId}>
              <span className="field-label">
                <span>{t('tags')}</span>
                <AiButton
                  disabled={dirty}
                  onClick={() => {
                    setChatTarget({
                      topic: `packaging:tags:${format}`,
                      title: t(format === 'long' ? 'tagsLong' : 'tagsShort'),
                    });
                  }}
                />
              </span>
              <TagsInput
                id={tagsId}
                aria-label={t('tags')}
                value={packaging.tags[format]}
                placeholder={t('tagsHint')}
                onChange={(tags) => {
                  setPackaging({
                    ...packaging,
                    tags: {
                      ...packaging.tags,
                      [format]: tags,
                    },
                  });
                }}
              />
            </label>
            <div className="field">
              <span className="field-label">
                <span>
                  {t('thumbnail')}
                  <InfoTip text={t('thumbnailHelp')} />
                </span>
                <AiButton
                  disabled={dirty}
                  onClick={() => {
                    setChatTarget({ topic: 'thumbnails', title: t('thumbnail') });
                  }}
                />
              </span>
              <div className="thumbnail-grid">
                {packaging.thumbnails.map((path, index) => (
                  <div className="thumbnail" key={path}>
                    <Thumbnail path={`${workspace.video?.path ?? ''}/${path}`} />
                    <div className="toolbar">
                      <span className="badge">{index === 0 ? t('mainThumbnail') : index + 1}</span>
                      <span className="spacer" />
                      <IconButton
                        label={t('moveLeft')}
                        disabled={index === 0}
                        onClick={() => {
                          move(index, -1);
                        }}
                      >
                        <ArrowLeft size={12} />
                      </IconButton>
                      <IconButton
                        label={t('moveRight')}
                        disabled={index === packaging.thumbnails.length - 1}
                        onClick={() => {
                          move(index, 1);
                        }}
                      >
                        <ArrowRight size={12} />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="button"
                type="button"
                disabled={dirty}
                onClick={() => {
                  void run(async () => {
                    const path = (await api.chooseFiles('images'))[0];
                    if (path)
                      setWorkspace(await api.importThumbnail({ scope: workspace.scope, sourcePath: path }));
                  });
                }}
              >
                <ImagePlus size={15} />
                {t('addThumbnail')}
              </button>
            </div>
          </div>
        </fieldset>
      </div>
      <div className="savebar">
        <IconButton
          label={t('discard')}
          disabled={!dirty || busy}
          onClick={() => {
            setPackaging(workspace.video?.packaging);
          }}
        >
          <RotateCcw size={15} />
        </IconButton>
        <button
          className="button primary"
          type="button"
          disabled={!dirty || busy}
          onClick={() => {
            setConfirm(true);
          }}
        >
          {t('save')}
        </button>
      </div>
      {confirm && (
        <CommitDialog
          summary={JSON.stringify({ before: workspace.video.packaging, after: packaging })}
          onClose={() => {
            setConfirm(false);
          }}
          onSave={async (commit) => {
            const next = await api.saveWorkspace({
              scope: workspace.scope,
              revision: workspace.revision,
              documents: [],
              brandConfig: null,
              packaging,
              commit,
            });
            setDirty(false);
            setWorkspace(next);
            setConfirm(false);
          }}
        />
      )}
    </>
  );
}
function Thumbnail({ path }: { path: string }) {
  const { api, run } = useApp();
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  useEffect(() => {
    void run(async () => {
      setUrl(await api.mediaUrl(path));
    });
  }, [api, path, run]);
  return url ? <img src={url} alt={t('thumbnail')} /> : null;
}
