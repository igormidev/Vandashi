import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { useApp } from '../../app/store';
import { ChatImage } from './ChatImage';
import { messagePath } from './message-path';

export function ChatMarkdown({
  text,
  root,
  mediaGeneration,
}: {
  text: string;
  root: string;
  mediaGeneration: number;
}) {
  const { api, run } = useApp();
  return (
    <ReactMarkdown
      urlTransform={(value) => (messagePath(value, root) ? value : defaultUrlTransform(value))}
      components={{
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
              const path = messagePath(href, root);
              if (path) void run(() => api.revealPath(path));
              else if (/^https?:\/\//i.test(href)) void run(() => api.openExternal(href));
            }}
          >
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
