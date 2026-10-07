import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import { memo, useMemo, useState } from 'react';
import remarkGfm from 'remark-gfm';
import { FileViewerDialog } from '../../shared/FileViewer';
import { useApp } from '../../app/store';
import { ChatImage } from './ChatImage';
import { messagePath } from './message-path';
import { ChatCodeBlock } from './ChatCodeBlock';
import { ChatTable } from './ChatTable';
import { messageCitationId } from './message-citation';

export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  root,
  mediaGeneration,
  streaming = false,
  onCitation,
}: {
  text: string;
  root: string;
  mediaGeneration: number;
  streaming?: boolean;
  onCitation?: (messageId: string) => void;
}) {
  const { api, run } = useApp();
  const [preview, setPreview] = useState<string | null>(null);
  // Text deltas must not replace component identities and discard an open diagram viewer.
  const components = useMemo<Components>(
    () => ({
      table: ChatTable,
      pre: ({ node }) => {
        const code = node?.children.find((child) => child.type === 'element' && child.tagName === 'code');
        const source =
          code?.type === 'element'
            ? code.children.map((child) => (child.type === 'text' ? child.value : '')).join('')
            : '';
        const classes =
          code?.type === 'element' && Array.isArray(code.properties.className)
            ? code.properties.className
            : [];
        const languageClass = classes.find((value) => typeof value === 'string' && /^language-/.test(value));
        const language = typeof languageClass === 'string' ? languageClass.slice(9) : '';
        return <ChatCodeBlock source={source} language={language} streaming={streaming} />;
      },
      img: ({ src, alt }) => {
        const path = typeof src === 'string' ? messagePath(src, root) : null;
        return <ChatImage key={path} path={path} alt={alt ?? ''} mediaGeneration={mediaGeneration} />;
      },
      a: ({ href, children }) => (
        <a
          href={href}
          onClick={(event) => {
            event.preventDefault();
            if (!href) return;
            const citation = messageCitationId(href);
            if (citation) {
              onCitation?.(citation);
              return;
            }
            const path = messagePath(href, root);
            if (path) setPreview(path);
            else if (/^https?:\/\//i.test(href)) void run(() => api.openExternal(href));
          }}
        >
          {children}
        </a>
      ),
    }),
    [root, mediaGeneration, streaming, onCitation, api, run],
  );
  const markdown = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(value) => (messagePath(value, root) ? value : defaultUrlTransform(value))}
        components={components}
      >
        {text}
      </ReactMarkdown>
    ),
    [text, root, components],
  );
  return (
    <>
      {markdown}
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
});
