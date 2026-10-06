import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FilePreview } from '../../domain/file-preview';
import { useApp } from '../app/store';
import { diagnosticFromBridge, type Diagnostic } from '../../domain/diagnostics';
import { diagnosticText } from '../app/diagnostics';
import { Loading, Modal } from './ui';
import { PdfPreview } from './PdfPreview';

export function FileViewer({ path }: { path: string }) {
  const { api, run } = useApp();
  const { t } = useTranslation();
  const [result, setResult] = useState<{ path: string; value: FilePreview } | null>(null);
  const [failure, setFailure] = useState<Diagnostic | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void api.filePreview(path).then(
      (value) => {
        if (active) setResult({ path, value });
      },
      (error: unknown) => {
        if (active) setFailure(diagnosticFromBridge(error));
      },
    );
    return () => {
      active = false;
    };
  }, [api, path, attempt]);
  if (failure)
    return (
      <div role="alert">
        <p>{diagnosticText(failure)}</p>
        <button
          type="button"
          className="button"
          onClick={() => {
            setFailure(null);
            setResult(null);
            setAttempt(attempt + 1);
          }}
        >
          {t('retry')}
        </button>
      </div>
    );
  const preview = result?.path === path ? result.value : null;
  if (!preview) return <Loading />;
  const name = path.split(/[\\/]/u).at(-1) ?? '';
  return (
    <div className="file-viewer">
      {preview.kind === 'image' && <img src={preview.url} alt={name} />}
      {preview.kind === 'video' && (
        <video src={preview.url} controls preload="metadata" aria-label={name}>
          <track kind="captions" />
        </video>
      )}
      {preview.kind === 'audio' && (
        <audio src={preview.url} controls preload="metadata" aria-label={name}>
          <track kind="captions" />
        </audio>
      )}
      {preview.kind === 'text' && <pre>{preview.text}</pre>}
      {preview.kind === 'pdf' && <PdfPreview key={path} base64={preview.base64} />}
      {preview.kind === 'other' && <p className="muted">{t('assetPreviewUnavailable')}</p>}
      <button
        type="button"
        className="button compact"
        onClick={() => {
          void run(() => api.revealPath(path));
        }}
      >
        {t('reveal')}
      </button>
    </div>
  );
}
export function FileViewerDialog({ path, onClose }: { path: string; onClose: () => void }) {
  return (
    <Modal title={path.split(/[\\/]/u).at(-1) ?? ''} open wide onClose={onClose}>
      <FileViewer key={path} path={path} />
    </Modal>
  );
}
