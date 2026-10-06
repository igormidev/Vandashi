import { File, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { assetKind } from '../../../domain/asset-kind';
import { useApp } from '../../app/store';
import { FileViewerDialog } from '../../shared/FileViewer';

export function AttachmentStrip({
  paths,
  disabled,
  onRemove,
}: {
  paths: string[];
  disabled: boolean;
  onRemove: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <>
      <div className="attachments">
        {paths.map((path) => (
          <div className="attachment" key={path}>
            <button
              type="button"
              className="attachment-open"
              onClick={() => {
                setPreview(path);
              }}
            >
              <AttachmentImage path={path} />
              <span>{path.split(/[\\/]/u).at(-1)}</span>
            </button>
            <button
              type="button"
              className="attachment-remove"
              aria-label={t('remove')}
              disabled={disabled}
              onClick={() => {
                onRemove(path);
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      {preview && (
        <FileViewerDialog
          path={preview}
          onClose={() => {
            setPreview(null);
          }}
        />
      )}
    </>
  );
}
function AttachmentImage({ path }: { path: string }) {
  const { api } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (assetKind(path) !== 'image') return;
    let active = true;
    void api.mediaUrl(path).then(
      (value) => {
        if (active) setUrl(value);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api, path]);
  return url ? <img src={url} alt="" /> : <File size={23} />;
}
