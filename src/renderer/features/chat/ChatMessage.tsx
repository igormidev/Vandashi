import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../../domain/models';
import { diagnosticText, messageText } from '../../app/diagnostics';
import { PendingLabel } from '../../shared/ui';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatImage } from './ChatImage';
import { AttachmentStrip } from './AttachmentStrip';
import { DiffFiles } from '../history/DiffFiles';

export function Message({
  message,
  root,
  mediaGeneration,
}: {
  message: ChatMessage;
  root: string;
  mediaGeneration: number;
}) {
  const { t } = useTranslation();
  if (message.appMessage)
    return (
      <article className={`message ${message.role === 'user' ? 'user' : 'receipt'}`}>
        <p>{messageText(message.appMessage)}</p>
        {message.userText && (
          <div className="message-body">
            <ChatMarkdown text={message.userText} root={root} mediaGeneration={mediaGeneration} />
          </div>
        )}
        {message.files.length > 0 && <DiffFiles files={message.files} />}
      </article>
    );
  if (message.diagnostic)
    return (
      <article className={`message ${message.role}`}>
        <p>{diagnosticText(message.diagnostic)}</p>
        {message.files.length > 0 && <DiffFiles files={message.files} />}
      </article>
    );
  if (message.role === 'reasoning' || message.role === 'tool')
    return (
      <div>
        <details className="reasoning">
          <summary>
            <Sparkles size={12} />
            {t(message.role === 'reasoning' ? 'thinking' : 'toolActivity')}
          </summary>
          <pre>{message.text}</pre>
          {message.files.length > 0 && <DiffFiles files={message.files} />}
        </details>
        {message.generatedImages?.map((path) => (
          <ChatImage key={path} path={path} mediaGeneration={mediaGeneration} />
        ))}
      </div>
    );
  return (
    <article className={`message ${message.role}`}>
      {!!message.attachments?.length && (
        <AttachmentStrip paths={message.attachments} disabled onRemove={() => undefined} />
      )}
      <div className="message-body">
        <ChatMarkdown text={message.text} root={root} mediaGeneration={mediaGeneration} />
      </div>
      {message.generatedImages?.map((path) => (
        <ChatImage key={path} path={path} mediaGeneration={mediaGeneration} />
      ))}
      {message.files.length > 0 && <DiffFiles files={message.files} />}
      {message.pending && (
        <PendingLabel label={t(message.pending === 'queued' ? 'queued' : 'sendingMessage')} />
      )}
    </article>
  );
}
