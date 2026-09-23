import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { IconButton } from '../../shared/ui';

export function ReviewThumbnails({
  paths,
  root,
  onChange,
}: {
  paths: string[];
  root: string;
  onChange: (paths: string[]) => void;
}) {
  const { t } = useTranslation();
  const move = (index: number, offset: number) => {
    const changed = paths.slice();
    const entry = changed[index];
    if (!entry) return;
    changed.splice(index, 1);
    changed.splice(index + offset, 0, entry);
    onChange(changed);
  };
  return (
    <div className="field">
      <span>{t('thumbnail')}</span>
      {paths.length ? (
        <div className="release-thumbnails">
          {paths.map((path, index) => (
            <div className="release-thumbnail" key={path}>
              <Candidate path={/^(?:[/\\]|[A-Za-z]:)/.test(path) ? path : `${root}/${path}`} index={index} />
              <div className="toolbar">
                {index === 0 && <span className="badge">{t('mainThumbnail')}</span>}
                <span className="spacer" />
                <IconButton
                  label={t('moveLeft')}
                  disabled={index === 0}
                  onClick={() => {
                    move(index, -1);
                  }}
                >
                  <ArrowLeft size={13} />
                </IconButton>
                <IconButton
                  label={t('moveRight')}
                  disabled={index === paths.length - 1}
                  onClick={() => {
                    move(index, 1);
                  }}
                >
                  <ArrowRight size={13} />
                </IconButton>
                <IconButton
                  label={t('launchRemoveThumbnail')}
                  onClick={() => {
                    onChange(paths.filter((entry) => entry !== path));
                  }}
                >
                  <X size={13} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{t('launchNoThumbnails')}</p>
      )}
      <p className="muted">{t('launchThumbnailHelp')}</p>
    </div>
  );
}
function Candidate({ path, index }: { path: string; index: number }) {
  const { t } = useTranslation();
  const { api } = useApp();
  const [url, setUrl] = useState('');
  useEffect(() => {
    let disposed = false;
    void api
      .mediaUrl(path)
      .then((value) => {
        if (!disposed) setUrl(value);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [api, path]);
  return url ? (
    <img src={url} alt={t('launchThumbnailCandidate', { index: index + 1 })} />
  ) : (
    <div className="release-thumbnail-empty">{t('launchThumbnailUnavailable')}</div>
  );
}
