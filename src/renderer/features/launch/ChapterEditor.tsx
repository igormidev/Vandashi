import { Crosshair, Play, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Chapter } from '../../../domain/models';
import { chapterIssue, chapterTime } from '../../../domain/launch';
import { useApp } from '../../app/store';
import { IconButton, Modal } from '../../shared/ui';

export function ChapterEditor({
  path,
  chapters,
  onClose,
  onSave,
}: {
  path: string | null;
  chapters: Chapter[];
  onClose: () => void;
  onSave: (chapters: Chapter[]) => void;
}) {
  const { t } = useTranslation();
  const { api, busy } = useApp();
  const [draft, setDraft] = useState(() => structuredClone(chapters));
  const [url, setUrl] = useState('');
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!path) return;
    let disposed = false;
    void api
      .mediaUrl(path)
      .then((result) => {
        if (!disposed) setUrl(result);
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
    };
  }, [api, path]);
  const issue = draft.length ? chapterIssue(draft, duration ?? undefined) : null;
  const update = (index: number, value: Partial<Chapter>) => {
    setDraft((current) =>
      current.map((entry, position) => (position === index ? { ...entry, ...value } : entry)),
    );
  };
  return (
    <Modal title={t('chapters')} description={t('launchChapterHelp')} open onClose={onClose} wide>
      {url && (
        <video
          className="chapter-video"
          ref={video}
          src={url}
          controls
          aria-label={t('preview')}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value) && value > 0) setDuration(value);
            else setError(true);
          }}
          onError={() => {
            setError(true);
          }}
        >
          <track kind="captions" />
        </video>
      )}
      {error && (
        <p className="field-error" role="alert">
          {t('launchPreviewError')}
        </p>
      )}
      {draft.map((chapter, index) => (
        <div className="chapter-editor-entry" key={index}>
          <div className="chapter-editor-row">
            <input
              type="number"
              min={0}
              max={duration ?? undefined}
              step={1}
              aria-label={t('launchChapterTime', { index: index + 1 })}
              value={chapter.seconds}
              onChange={(event) => {
                update(index, { seconds: Number(event.target.value) });
              }}
            />
            <input
              aria-label={t('launchChapterTitle', { index: index + 1 })}
              value={chapter.title}
              onChange={(event) => {
                update(index, { title: event.target.value });
              }}
            />
            <IconButton
              label={t('launchUsePlayhead')}
              disabled={duration === null || busy}
              onClick={() => {
                update(index, { seconds: Math.floor(video.current?.currentTime ?? 0) });
              }}
            >
              <Crosshair size={15} />
            </IconButton>
            <IconButton
              label={t('launchSeekChapter')}
              disabled={duration === null}
              onClick={() => {
                if (video.current) video.current.currentTime = chapter.seconds;
              }}
            >
              <Play size={14} />
            </IconButton>
            <button
              className="button small"
              type="button"
              onClick={() => {
                setDraft(draft.filter((_entry, position) => position !== index));
              }}
            >
              {t('remove')}
            </button>
          </div>
          {duration !== null && (
            <input
              type="range"
              min={0}
              max={Math.floor(duration)}
              step={1}
              value={chapter.seconds}
              aria-label={t('launchChapterPosition', { index: index + 1 })}
              aria-valuetext={chapterTime(chapter.seconds)}
              onChange={(event) => {
                update(index, { seconds: Number(event.target.value) });
              }}
            />
          )}
        </div>
      ))}
      {issue && (
        <p className="field-error" role="alert">
          {t(issue)}
        </p>
      )}
      <div className="modal-actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => {
            setDraft([...draft, { seconds: (draft.at(-1)?.seconds ?? -10) + 10, title: '' }]);
          }}
        >
          <Plus size={14} />
          {t('addChapter')}
        </button>
        <span className="spacer" />
        <button className="button" type="button" onClick={onClose}>
          {t('cancel')}
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy || !!issue || (draft.length > 0 && (duration === null || error))}
          onClick={() => {
            onSave(draft.map((chapter) => ({ ...chapter, title: chapter.title.trim() })));
          }}
        >
          {t('save')}
        </button>
      </div>
    </Modal>
  );
}
