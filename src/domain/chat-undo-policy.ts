import type { AppMessage } from './messages';
import type { ChatSession } from './models';
import { setupTarget } from './setup';

/** Legacy publishing checkpoints have unknown external effects, so only explicit read turns are reversible. */
export function chatUndoIssue(
  session: Pick<ChatSession, 'topic' | 'checkpoints' | 'messages'>,
): AppMessage | null {
  if (setupTarget(session.topic)) return { id: 'appSetupUndoUnavailable' };
  const checkpoint = session.checkpoints?.at(-1);
  const lastUser = [...session.messages].reverse().find((message) => message.role === 'user');
  return session.topic.startsWith('publish:') &&
    checkpoint &&
    (checkpoint.mode !== 'read' || lastUser?.turnId !== checkpoint.turnId)
    ? { id: 'appPublishUndoUnavailable' }
    : null;
}
