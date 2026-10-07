import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PendingLabel } from '../../shared/ui';
import { diagramPromise } from './mermaid-rendering';

export function MermaidDiagram({ source }: { source: string }) {
  const { t } = useTranslation();
  const [rendered, setRendered] = useState<{ source: string; svg: string | null } | null>(null);
  useEffect(() => {
    let subscribed = true;
    void diagramPromise(source).then((svg) => {
      if (subscribed) setRendered({ source, svg });
    });
    return () => {
      subscribed = false;
    };
  }, [source]);
  if (rendered?.source !== source)
    return (
      <div className="chat-diagram-pending" role="status">
        <PendingLabel label={t('loading')} />
      </div>
    );
  if (!rendered.svg)
    return (
      <div className="chat-diagram-failure">
        <p>{t('chatDiagramUnavailable')}</p>
        <pre>{source}</pre>
      </div>
    );
  return (
    <div
      className="chat-diagram"
      role="img"
      aria-label={t('chatDiagram')}
      dangerouslySetInnerHTML={{ __html: rendered.svg }}
    />
  );
}
