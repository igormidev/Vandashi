import { Code, Workflow } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../../shared/ui';
import { MessageCopyButton } from './MessageCopyButton';
import { highlightCode, type CodeToken } from './syntax-highlighting';
import { MermaidDiagram } from './MermaidDiagram';
import './chat-markdown.css';

export function ChatCodeBlock({
  source,
  language,
  streaming,
}: {
  source: string;
  language: string;
  streaming: boolean;
}) {
  const { t } = useTranslation();
  const [highlighted, setHighlighted] = useState<{
    source: string;
    language: string;
    tokens: CodeToken[][] | null;
  } | null>(null);
  const [showSource, setShowSource] = useState(false);
  useEffect(() => {
    let subscribed = true;
    void highlightCode(source, language).then((tokens) => {
      if (subscribed) setHighlighted({ source, language, tokens });
    });
    return () => {
      subscribed = false;
    };
  }, [source, language]);
  const tokens =
    highlighted?.source === source && highlighted.language === language ? highlighted.tokens : null;
  const mermaid = /^mermaid$/i.test(language);
  return (
    <div className="chat-code">
      <div className="chat-code-heading">
        <span>{language || t('chatCode')}</span>
        <div className="chat-code-actions">
          {mermaid && !streaming && (
            <IconButton
              label={t(showSource ? 'chatDiagram' : 'chatDiagramSource')}
              onClick={() => {
                setShowSource(!showSource);
              }}
            >
              {showSource ? <Workflow size={13} /> : <Code size={13} />}
            </IconButton>
          )}
          <MessageCopyButton text={source} />
        </div>
      </div>
      {mermaid && !streaming && !showSource ? (
        <MermaidDiagram source={source} />
      ) : (
        <pre>
          <code>
            {tokens
              ? tokens.map((line, index) => (
                  <Fragment key={index}>
                    {line.map((token, tokenIndex) => (
                      <span key={tokenIndex} style={token.color ? { color: token.color } : undefined}>
                        {token.text}
                      </span>
                    ))}
                    {index < tokens.length - 1 ? '\n' : ''}
                  </Fragment>
                ))
              : source}
          </code>
        </pre>
      )}
    </div>
  );
}
