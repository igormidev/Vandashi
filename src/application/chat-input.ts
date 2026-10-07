import type { AgentPort } from '../domain/agent';
import type { AgentInputRequest, ChatInputRequest, ChatInputResponse } from '../domain/chat-input';
import { validateInputResponse } from '../domain/chat-input';
import { AppFault } from '../domain/diagnostics';
import type { AppEvent } from '../domain/models';
import type { OperationGate } from './operation-gate';

export interface InputOwner {
  sessionId: string;
  threadId: string | null;
  turnId: string | null;
}

/** Questions inherit the chat's live lease; answers never open another operation. */
export class ChatInputs {
  private owner: InputOwner | null = null;
  private request: ChatInputRequest | null = null;
  private answering = false;
  constructor(
    private readonly agent: AgentPort,
    private readonly gate: OperationGate,
    private readonly notify: (event: AppEvent) => void,
  ) {}
  begin(sessionId: string, threadId: string | null): InputOwner {
    if (this.owner || !this.gate.busy) throw new AppFault({ id: 'appOperationBusy' });
    this.owner = { sessionId, threadId, turnId: null };
    return this.owner;
  }
  pending(sessionId: string): ChatInputRequest | null {
    return this.gate.busy && this.owner?.sessionId === sessionId && this.request
      ? structuredClone(this.request)
      : null;
  }
  update(owner: InputOwner, request: AgentInputRequest | null): void {
    if (this.owner !== owner) return;
    if (!request) this.clear();
    else if (
      this.gate.busy &&
      owner.threadId === request.threadId &&
      owner.turnId !== null &&
      owner.turnId === request.turnId
    ) {
      this.request = { ...request, sessionId: owner.sessionId };
      this.notify({ type: 'chat-input', sessionId: owner.sessionId, request: this.pending(owner.sessionId) });
    }
  }
  async respond(response: ChatInputResponse): Promise<void> {
    const request = this.request;
    const owner = this.owner;
    if (
      !request ||
      !owner ||
      !this.gate.busy ||
      this.answering ||
      response.sessionId !== owner.sessionId ||
      owner.threadId !== request.threadId ||
      owner.turnId !== request.turnId ||
      !this.agent.respondUserInput
    )
      throw new AppFault({ id: 'untrustedRequest' });
    validateInputResponse(request, response);
    this.answering = true;
    try {
      await this.agent.respondUserInput(response);
      if (this.owner === owner && this.request === request) this.clear();
    } finally {
      if (this.owner === owner) this.answering = false;
    }
  }
  end(owner: InputOwner): void {
    if (this.owner !== owner) return;
    this.clear();
    this.owner = null;
  }
  private clear(): void {
    const request = this.request;
    this.request = null;
    this.answering = false;
    if (request) this.notify({ type: 'chat-input', sessionId: request.sessionId, request: null });
  }
}
