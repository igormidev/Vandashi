import { ArrowLeft, LoaderCircle, Rocket, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { verticalPlatforms, chapterTime } from '../../../domain/launch';
import { useApp } from '../../app/store';
import { IconButton } from '../../shared/ui';
import { TagsInput } from '../../shared/TagsInput';
import { ChapterEditor } from './ChapterEditor';
import { ReviewThumbnails } from './ReviewThumbnails';
import type { ReleaseDraft } from './release-draft';

export function PublishReview({
  draft,
  onChange,
  onBack,
  onPrepared,
  prepared,
  onEdit,
}: {
  draft: ReleaseDraft;
  onChange: (draft: ReleaseDraft) => void;
  onBack: () => void;
  onPrepared: () => void;
  prepared: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const { workspace, api, run, busy, dirty, setChatTarget } = useApp();
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const tagsId = useId();
  if (!workspace) return null;
  const format = verticalPlatforms.includes(draft.platform) ? 'short' : 'long';
  const packaging = draft.packaging;
  const channel =
    workspace.brand.config.platforms[draft.platform === 'youtubeShorts' ? 'youtube' : draft.platform];
  const lock = busy || dirty || generating || preparing;
  const prepare = async () => {
    setPreparing(true);
    try {
      const result = await api.preparePublish({
        scope: workspace.scope,
        platform: draft.platform,
        browser: draft.browser,
        packaging,
        clipId: draft.clipId,
        chapters: draft.chapters,
      });
      setChatTarget({
        topic: result.session.topic,
        title: `${t(draft.platform)} · ${draft.source.name}`,
        prompt: result.prompt,
      });
      onPrepared();
    } finally {
      setPreparing(false);
    }
  };
  return (
    <div className="page launch-review">
      <div className="page-header">
        <div className="toolbar">
          <IconButton label={t('back')} disabled={lock} onClick={onBack}>
            <ArrowLeft size={17} />
          </IconButton>
          <div>
            <h1>{t(draft.platform)}</h1>
            <p className="muted">{draft.source.name}</p>
          </div>
        </div>
        {prepared && (
          <button className="button" type="button" disabled={lock} onClick={onEdit}>
            {t('launchEditReview')}
          </button>
        )}
      </div>
      <fieldset disabled={lock || prepared}>
        <div className="form">
          <div className="release-target">
            <span className="eyebrow">{t('launchDestination')}</span>
            <strong>{workspace.brand.name}</strong>
            {channel?.url ? (
              <button
                className="text-link"
                type="button"
                onClick={() => {
                  void run(() => api.openExternal(channel.url));
                }}
              >
                {channel.url}
              </button>
            ) : (
              <p className="field-error" role="alert">
                {t('launchMissingChannel')}
              </p>
            )}
          </div>
          <label className="field">
            <span>{t('titles')}</span>
            <textarea
              rows={2}
              value={packaging.titles[format].join('\n')}
              onChange={(event) => {
                onChange({
                  ...draft,
                  packaging: {
                    ...packaging,
                    titles: { ...packaging.titles, [format]: event.target.value.split('\n') },
                  },
                });
              }}
            />
          </label>
          <label className="field">
            <span>{t('description')}</span>
            <textarea
              rows={6}
              value={packaging.descriptions[format]}
              onChange={(event) => {
                onChange({
                  ...draft,
                  packaging: {
                    ...packaging,
                    descriptions: { ...packaging.descriptions, [format]: event.target.value },
                  },
                });
              }}
            />
          </label>
          <label className="field" htmlFor={tagsId}>
            <span>{t('tags')}</span>
            <TagsInput
              id={tagsId}
              value={packaging.tags[format]}
              onChange={(tags) => {
                onChange({
                  ...draft,
                  packaging: {
                    ...packaging,
                    tags: { ...packaging.tags, [format]: tags },
                  },
                });
              }}
            />
          </label>
          <ReviewThumbnails
            paths={packaging.thumbnails}
            root={draft.source.path}
            onChange={(thumbnails) => {
              onChange({ ...draft, packaging: { ...packaging, thumbnails } });
            }}
          />
          <label className="field">
            <span>{t('browser')}</span>
            <input
              value={draft.browser}
              placeholder={t('browserHint')}
              onChange={(event) => {
                onChange({ ...draft, browser: event.target.value });
              }}
            />
          </label>
          {draft.platform === 'youtube' && (
            <div className="field">
              <span>{t('chapters')}</span>
              <div className="toolbar">
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setGenerating(true);
                    void run(async () => {
                      try {
                        const chapters = await api.generateChapters(workspace.scope);
                        onChange({ ...draft, chapters });
                        setEditing(true);
                      } finally {
                        setGenerating(false);
                      }
                    });
                  }}
                >
                  {generating ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}
                  {t(generating ? 'launchGeneratingChapters' : 'generateChapters')}
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setEditing(true);
                  }}
                >
                  {t('edit')}
                </button>
                {draft.chapters.length > 0 && (
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => {
                      onChange({ ...draft, chapters: [] });
                    }}
                  >
                    {t('launchRemoveChapters')}
                  </button>
                )}
              </div>
              {draft.chapters.map((chapter, index) => (
                <div className="chapter-summary" key={index}>
                  <span className="mono">{chapterTime(chapter.seconds)}</span>
                  <span>{chapter.title}</span>
                </div>
              ))}
            </div>
          )}
          <button
            className="button primary"
            type="button"
            disabled={
              lock ||
              !channel?.url.trim() ||
              !draft.browser.trim() ||
              !packaging.titles[format].some((title) => title.trim())
            }
            onClick={() => {
              void run(prepare);
            }}
          >
            {preparing ? <LoaderCircle className="spin" size={14} /> : <Rocket size={14} />}
            {t(preparing ? 'loading' : 'publishPrompt')}
          </button>
          <p className="muted">{t('publishingHelp')}</p>
          <p className="muted">{t('launchDraftHelp')}</p>
        </div>
      </fieldset>
      {editing && (
        <ChapterEditor
          path={draft.source.renderedPath}
          chapters={draft.chapters}
          onClose={() => {
            setEditing(false);
          }}
          onSave={(chapters) => {
            onChange({ ...draft, chapters });
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
