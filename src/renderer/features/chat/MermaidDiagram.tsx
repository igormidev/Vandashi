import { Maximize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, PendingLabel } from '../../shared/ui';
import { diagramPromise } from './mermaid-rendering';
import { ExpandedDiagram, type DiagramSnapshot } from './ExpandedDiagram';

export function MermaidDiagram({ source }: { source: string }) {
  const { t } = useTranslation();
  const [rendered, setRendered] = useState<{ source: string; svg: string | null } | null>(null);
  const [expanded, setExpanded] = useState<DiagramSnapshot | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const currentTrigger = useRef<HTMLDivElement>(null);
  const codeRoot = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let subscribed = true;
    void diagramPromise(source).then((svg) => {
      if (subscribed) setRendered({ source, svg });
    });
    return () => {
      subscribed = false;
    };
  }, [source]);
  const ready = rendered?.source === source && rendered.svg;
  const body =
    rendered?.source !== source ? (
      <div className="chat-diagram-pending" role="status">
        <PendingLabel label={t('loading')} />
      </div>
    ) : !rendered.svg ? (
      <div className="chat-diagram-failure">
        <p>{t('chatDiagramUnavailable')}</p>
        <pre>{source}</pre>
      </div>
    ) : (
      <div className="chat-diagram-preview">
        <div
          ref={preview}
          className="chat-diagram"
          role="img"
          aria-label={t('chatDiagram')}
          style={expanded?.svg === rendered.svg ? { height: expanded.height } : undefined}
          dangerouslySetInnerHTML={{ __html: expanded?.svg === rendered.svg ? '' : rendered.svg }}
        />
        <div className="chat-diagram-expand" ref={currentTrigger}>
          <IconButton
            label={t('chatDiagramExpand')}
            onClick={(event) => {
              if (!ready) return;
              opener.current = event.currentTarget;
              codeRoot.current = event.currentTarget.closest('.chat-code');
              setExpanded({
                source,
                svg: ready,
                height: preview.current?.getBoundingClientRect().height ?? 0,
              });
            }}
          >
            <Maximize2 size={14} />
          </IconButton>
        </div>
      </div>
    );
  return (
    <>
      {body}
      {expanded && (
        <ExpandedDiagram
          snapshot={expanded}
          onClose={() => {
            setExpanded(null);
            requestAnimationFrame(() => {
              const target = opener.current?.isConnected
                ? opener.current
                : (currentTrigger.current?.querySelector<HTMLButtonElement>('button') ??
                  codeRoot.current?.querySelector<HTMLButtonElement>('button'));
              if (target?.isConnected) target.focus();
            });
          }}
        />
      )}
    </>
  );
}
