import type { AppEvent } from '../../domain/models';
import type { AppMessage } from '../../domain/messages';

/** Consume only newly emitted, durable application receipts; history loads never enter this path. */
export class ReceiptToasts {
  private readonly shown = new Set<string>();

  consume(event: AppEvent): AppMessage | null {
    if (event.type !== 'chat' || event.delta) return null;
    const { message } = event;
    if (
      message.role !== 'tool' ||
      message.appMessage?.id !== 'turnSaved' ||
      message.diagnostic ||
      !message.turnId ||
      !message.id.startsWith('receipt:') ||
      message.files.length === 0
    )
      return null;
    const key = JSON.stringify([event.sessionId, message.id]);
    if (this.shown.has(key)) return null;
    this.shown.add(key);
    return message.appMessage;
  }
}
