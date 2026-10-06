import type { AppEvent, ChatRequest } from '../domain/models';
export function publishPending(
  notify: (event: AppEvent) => void,
  request: ChatRequest,
  pending: 'sending' | 'queued' | null,
): void {
  const id = request.clientMessageId;
  if (!id) return;
  notify({
    type: 'chat-pending',
    sessionId: request.sessionId,
    id,
    message: pending
      ? {
          id,
          role: 'user',
          text: request.text,
          turnId: null,
          files: [],
          attachments: request.attachments,
          createdAt: new Date().toISOString(),
          pending,
        }
      : null,
  });
}
