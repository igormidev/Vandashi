import { Code, RotateCcw, Workflow, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Modal } from '../../shared/ui';
import { MessageCopyButton } from './MessageCopyButton';

export interface DiagramSnapshot {
  source: string;
  svg: string;
  height: number;
}
export function ExpandedDiagram({ snapshot, onClose }: { snapshot: DiagramSnapshot; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [sourceMode, setSourceMode] = useState(false);
  const [copying, setCopying] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [dragging, setDragging] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const center = useRef<{ left: number; top: number; ratio: number } | null>(null);
  const pan = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const view = viewport.current;
    const pending = center.current;
    if (!view || !pending) return;
    center.current = null;
    view.scrollLeft = pending.left * pending.ratio - view.clientWidth / 2;
    view.scrollTop = pending.top * pending.ratio - view.clientHeight / 2;
  }, [zoom]);
  const changeZoom = (next: number) => {
    const value = Math.max(50, Math.min(400, next));
    if (copying || sourceMode || value === zoom) return;
    stopPan();
    const view = viewport.current;
    if (view)
      center.current = {
        left: view.scrollLeft + view.clientWidth / 2,
        top: view.scrollTop + view.clientHeight / 2,
        ratio: value / zoom,
      };
    setZoom(value);
  };
  const reset = () => {
    if (copying || sourceMode) return;
    stopPan();
    center.current = null;
    if (viewport.current) {
      viewport.current.scrollLeft = 0;
      viewport.current.scrollTop = 0;
    }
    setZoom(100);
  };
  const stopPan = useCallback(() => {
    const current = pan.current;
    pan.current = null;
    if (current && viewport.current?.hasPointerCapture(current.id))
      viewport.current.releasePointerCapture(current.id);
    setDragging(false);
  }, []);
  // Radix mounts portal content after the parent effect pass. Bind to the actual owned DOM node.
  const bindViewport = useCallback(
    (view: HTMLDivElement | null) => {
      viewport.current = view;
      if (!view || copying || sourceMode) return;
      const keyboardPan = (event: KeyboardEvent) => {
        if (
          event.target !== view ||
          event.isComposing ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return;
        let left = view.scrollLeft;
        let top = view.scrollTop;
        if (event.key === 'ArrowLeft') left -= 40;
        else if (event.key === 'ArrowRight') left += 40;
        else if (event.key === 'ArrowUp') top -= 40;
        else if (event.key === 'ArrowDown') top += 40;
        else if (event.key === 'PageUp') top -= view.clientHeight * 0.85;
        else if (event.key === 'PageDown') top += view.clientHeight * 0.85;
        else if (event.key === 'Home') left = top = 0;
        else if (event.key === 'End') {
          left = view.scrollWidth - view.clientWidth;
          top = view.scrollHeight - view.clientHeight;
        } else return;
        event.preventDefault();
        event.stopPropagation();
        stopPan();
        view.scrollLeft = left;
        view.scrollTop = top;
      };
      view.addEventListener('keydown', keyboardPan);
      return () => {
        view.removeEventListener('keydown', keyboardPan);
        if (viewport.current === view) viewport.current = null;
      };
    },
    [copying, sourceMode, stopPan],
  );
  const zoomLabel = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(zoom / 100);
  return (
    <Modal title={t('chatDiagram')} open onClose={onClose} wide locked={copying}>
      <div className="chat-diagram-expanded">
        <div className="chat-diagram-expanded-toolbar">
          <div className="chat-diagram-zoom">
            <IconButton
              label={t('chatDiagramZoomOut')}
              disabled={copying || sourceMode || zoom <= 50}
              onClick={() => {
                changeZoom(zoom - 25);
              }}
            >
              <ZoomOut size={14} />
            </IconButton>
            <span aria-live="polite">{zoomLabel}</span>
            <IconButton
              label={t('chatDiagramZoomIn')}
              disabled={copying || sourceMode || zoom >= 400}
              onClick={() => {
                changeZoom(zoom + 25);
              }}
            >
              <ZoomIn size={14} />
            </IconButton>
            <IconButton label={t('chatDiagramReset')} disabled={copying || sourceMode} onClick={reset}>
              <RotateCcw size={14} />
            </IconButton>
          </div>
          <IconButton
            label={t(sourceMode ? 'chatDiagram' : 'chatDiagramSource')}
            disabled={copying}
            aria-pressed={sourceMode}
            onClick={() => {
              stopPan();
              setSourceMode(!sourceMode);
            }}
          >
            {sourceMode ? <Workflow size={14} /> : <Code size={14} />}
          </IconButton>
          <MessageCopyButton
            text={snapshot.source}
            onPendingChange={(value) => {
              if (value) stopPan();
              setCopying(value);
            }}
          />
        </div>
        <textarea
          className="chat-diagram-source"
          aria-label={t('chatDiagramSource')}
          hidden={!sourceMode}
          readOnly
          spellCheck={false}
          value={snapshot.source}
        />
        <div
          ref={bindViewport}
          className={`chat-diagram chat-diagram-full-view ${dragging ? 'is-dragging' : ''} ${copying ? 'is-locked' : ''}`}
          role="region"
          aria-label={t('chatDiagram')}
          hidden={sourceMode}
          inert={copying}
          tabIndex={copying || sourceMode ? -1 : 0}
          onPointerDown={(event) => {
            const view = event.currentTarget;
            if (
              copying ||
              sourceMode ||
              !event.isPrimary ||
              pan.current ||
              event.button !== 0 ||
              event.pointerType === 'touch' ||
              (view.scrollWidth <= view.clientWidth && view.scrollHeight <= view.clientHeight)
            )
              return;
            event.preventDefault();
            view.focus();
            view.setPointerCapture(event.pointerId);
            pan.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              left: view.scrollLeft,
              top: view.scrollTop,
            };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const current = pan.current;
            if (!current || current.id !== event.pointerId || copying || sourceMode) return;
            event.currentTarget.scrollLeft = current.left - (event.clientX - current.x);
            event.currentTarget.scrollTop = current.top - (event.clientY - current.y);
          }}
          onPointerUp={stopPan}
          onPointerCancel={stopPan}
          onLostPointerCapture={stopPan}
        >
          <div
            className="chat-diagram-canvas"
            style={{ width: `${String(zoom)}%` }}
            role="img"
            aria-label={t('chatDiagram')}
            dangerouslySetInnerHTML={{ __html: snapshot.svg }}
          />
        </div>
      </div>
    </Modal>
  );
}
