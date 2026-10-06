import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loading } from './ui';

GlobalWorkerOptions.workerSrc = workerUrl;
export function PdfPreview({ base64 }: { base64: string }) {
  const { t } = useTranslation();
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const [rendering, setRendering] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    const loader = getDocument({
      data: Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
      enableXfa: false,
      useSystemFonts: true,
    });
    void loader.promise.then(
      (result) => {
        if (active) setDocument(result);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
      void loader.destroy();
    };
  }, [base64]);
  useEffect(() => {
    if (!document || !canvas.current) return;
    const target = canvas.current;
    let active = true;
    let cancel: (() => void) | undefined;
    setRendering(true);
    void document
      .getPage(page)
      .then(async (pdfPage) => {
        if (!active) return;
        const viewport = pdfPage.getViewport({ scale: zoom * 1.3 });
        target.width = viewport.width;
        target.height = viewport.height;
        const task = pdfPage.render({ canvas: target, viewport });
        cancel = () => {
          task.cancel();
        };
        await task.promise;
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setRendering(false);
      });
    return () => {
      active = false;
      cancel?.();
    };
  }, [document, page, zoom]);
  if (failed)
    return (
      <p className="muted" role="alert">
        {t('assetPreviewUnavailable')}
      </p>
    );
  if (!document) return <Loading />;
  return (
    <div className="pdf-preview">
      <div className="pdf-controls">
        <button
          className="button compact"
          type="button"
          disabled={page === 1 || rendering}
          onClick={() => {
            setPage(page - 1);
          }}
        >
          {t('previous')}
        </button>
        <span>{t('pdfPage', { page: String(page), pages: String(document.numPages) })}</span>
        <button
          className="button compact"
          type="button"
          disabled={page === document.numPages || rendering}
          onClick={() => {
            setPage(page + 1);
          }}
        >
          {t('next')}
        </button>
        <button
          className="button compact"
          type="button"
          aria-label={t('smallerText')}
          disabled={zoom <= 0.5 || rendering}
          onClick={() => {
            setZoom(zoom - 0.25);
          }}
        >
          −
        </button>
        <button
          className="button compact"
          type="button"
          aria-label={t('biggerText')}
          disabled={zoom >= 2 || rendering}
          onClick={() => {
            setZoom(zoom + 0.25);
          }}
        >
          +
        </button>
      </div>
      <div className="pdf-pages" aria-busy={rendering}>
        <canvas
          ref={canvas}
          aria-label={t('pdfPage', { page: String(page), pages: String(document.numPages) })}
        />
      </div>
    </div>
  );
}
