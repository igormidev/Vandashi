import type { AppMessage } from './messages';
import type { ChatSession } from './models';

/** Legacy publishing checkpoints have unknown external effects, so only explicit read turns are reversible. */
export function publishingUndoIssue(
  session: Pick<ChatSession, 'topic' | 'checkpoints' | 'messages'>,
): AppMessage | null {
  const checkpoint = session.checkpoints?.at(-1);
  const lastUser = [...session.messages].reverse().find((message) => message.role === 'user');
  return session.topic.startsWith('publish:') &&
    checkpoint &&
    (checkpoint.mode !== 'read' || lastUser?.turnId !== checkpoint.turnId)
    ? { id: 'appPublishUndoUnavailable' }
    : null;
}
