import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { Modal } from '../../shared/ui';

export function ChatImage({ path, alt }: { path: string | null; alt?: string }) {
  const { t } = useTranslation();
  return path ? (
    <LocalImage key={path} path={path} alt={alt ?? ''} />
  ) : (
    <span className="chat-image-fallback">{t('chatImageUnavailable')}</span>
  );
}

function LocalImage({ path, alt }: { path: string; alt: string }) {
  const { api } = useApp();
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void api.mediaUrl(path).then(
      (value) => {
        if (active) setUrl(value);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [api, path, attempt]);
  const label = alt || t('chatGeneratedImage');
  if (failed)
    return (
      <span className="chat-image-fallback">
        <span>{t('chatImageUnavailable')}</span>{' '}
        <button
          type="button"
          className="button small ghost"
          onClick={() => {
            setFailed(false);
            setUrl(null);
            setOpen(false);
            setAttempt((value) => value + 1);
          }}
        >
          {t('chatRetryImage')}
        </button>
      </span>
    );
  if (!url) return <span className="chat-image-fallback">{t('loading')}</span>;
  return (
    <>
      <button
        type="button"
        className="chat-image"
        aria-label={t('chatInspectImage', { name: label })}
        onClick={() => {
          setOpen(true);
        }}
      >
        <img
          src={url}
          alt={label}
          onError={() => {
            setFailed(true);
          }}
        />
      </button>
      {open && (
        <Modal
          title={label}
          open
          wide
          onClose={() => {
            setOpen(false);
          }}
        >
          <img
            className="chat-image-full"
            src={url}
            alt={label}
            onError={() => {
              setFailed(true);
            }}
          />
        </Modal>
      )}
    </>
  );
}
