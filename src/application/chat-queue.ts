import type { AppEvent, ChatRequest } from '../domain/models';
import type { QueuedChat } from '../domain/chat-queue';
import { AppFault, diagnosticFromError } from '../domain/diagnostics';
import type { StoragePort } from '../domain/storage';
import type { OperationGate } from './operation-gate';

/** Explicit, session-bound live intents. No new turn starts before persistence and recovery settle. */
export class ChatQueue {
  private entries: QueuedChat[] = [];
  private starting = false;
  constructor(
    private readonly store: StoragePort,
    private readonly gate: OperationGate,
    private readonly send: (request: ChatRequest) => Promise<void>,
    private readonly emit: (event: AppEvent) => void,
  ) {}
  list(sessionId: string): QueuedChat[] {
    return structuredClone(this.entries.filter((entry) => entry.request.sessionId === sessionId));
  }
  get hasPending(): boolean {
    return this.entries.length > 0;
  }
  private changed(sessionId: string): void {
    this.emit({ type: 'chat-queue', sessionId, entries: this.list(sessionId) });
  }
  async enqueue(request: ChatRequest): Promise<void> {
    if (!this.gate.busy && this.entries.length === 0) return this.send(request);
    if (!this.gate.owns(request.sessionId) || !request.text.trim() || this.entries.length >= 20)
      throw new AppFault({ id: 'appOperationBusy' });
    const session = await this.store.getSession(request.sessionId);
    // Setup settlement requires fresh checks. Uploads have external effects, not ordinary edits.
    if (/^(?:setup:|publish:)/u.test(session.topic) || !this.gate.owns(request.sessionId))
      throw new AppFault({ id: 'appOperationBusy' });
    const id = request.clientMessageId ?? crypto.randomUUID();
    if (
      this.entries.some((entry) => entry.id === id) ||
      session.messages.some((message) => message.id === id)
    )
      throw new AppFault({ id: 'untrustedRequest' });
    this.entries.push({ id, request: structuredClone({ ...request, clientMessageId: id }), failed: false });
    this.emit({
      type: 'chat-pending',
      sessionId: session.id,
      id,
      message: {
        id,
        role: 'user',
        text: request.text,
        turnId: null,
        files: [],
        attachments: request.attachments,
        createdAt: new Date().toISOString(),
        pending: 'queued',
      },
    });
    this.changed(session.id);
  }
  remove({ sessionId, id }: { sessionId: string; id: string }): Promise<void> {
    const entry = this.entries.find((entry) => entry.id === id && entry.request.sessionId === sessionId);
    // Editing adopts the draft only after this acknowledgement. A stale entry must
    // fail, otherwise an already dispatched/sent request could be restored and sent twice.
    if (!entry) return Promise.reject(new AppFault({ id: 'untrustedRequest' }));
    if (this.starting && this.entries[0] === entry)
      return Promise.reject(new AppFault({ id: 'appOperationBusy' }));
    this.entries = this.entries.filter((candidate) => candidate !== entry);
    this.emit({ type: 'chat-pending', sessionId, id, message: null });
    this.changed(sessionId);
    return Promise.resolve();
  }
  pause(): void {
    for (const entry of this.entries) {
      entry.failed = true;
      this.emit({ type: 'chat-pending', sessionId: entry.request.sessionId, id: entry.id, message: null });
    }
    for (const id of new Set(this.entries.map((entry) => entry.request.sessionId))) this.changed(id);
  }
  settle(): void {
    if (this.starting || this.gate.busy) return;
    const entry = this.entries[0];
    if (!entry || entry.failed) return;
    this.starting = true;
    // send reserves the next lease synchronously; its preflight revalidates attachments.
    void this.send(entry.request)
      .then(
        () => {
          this.entries = this.entries.filter((candidate) => candidate !== entry);
          this.changed(entry.request.sessionId);
        },
        (error: unknown) => {
          entry.failed = true;
          this.changed(entry.request.sessionId);
          this.emit({
            type: 'notice',
            code: 'save-failed',
            detail: '',
            diagnostic: diagnosticFromError(error),
          });
        },
      )
      .finally(() => {
        this.starting = false;
        if (!this.gate.busy) this.settle();
      });
  }
}
