import { AppFault, diagnosticFromError } from '../domain/diagnostics';
import { undoChat } from './chat-undo';
import { openChatSession } from './chat-history';
import { repositoryHeads, turnReceipt } from './turn-receipt';
import type { MediaPort } from '../domain/media';
import type { OpenedChat } from '../domain/api';
import type { AgentPort } from '../domain/agent';
import { AgentError } from '../domain/agent';
import type { AppEvent, ChatMessage, ChatRequest, ChatSession, Scope } from '../domain/models';
import { appMessagesEn } from '../domain/messages';
import type { GitPort, StoragePort } from '../domain/storage';
import type { Commits } from './commits';
import type { OperationGate } from './operation-gate';
import type { Prepared, ScriptInput } from './chat-types';
import { ChatPreparation } from './chat-preparation';

export class Chats {
  private readonly preparation: ChatPreparation;
  constructor(
    private readonly store: StoragePort,
    private readonly git: GitPort,
    private readonly agent: AgentPort,
    private readonly commits: Commits,
    private readonly gate: OperationGate,
    private readonly emit: (event: AppEvent) => void,
    media?: MediaPort,
  ) {
    this.preparation = new ChatPreparation(
      store,
      git,
      agent,
      commits,
      (event) => {
        this.notify(event);
      },
      media,
    );
  }
  private notify(event: AppEvent): void {
    try {
      this.emit(event);
    } catch {
      /* Persist even when the window has closed. */
    }
  }
  async open(input: { scope: Scope; topic: string; title: string }): Promise<OpenedChat> {
    const foregroundBusy = () => this.gate.busy && !this.gate.readingWorkspace;
    if (foregroundBusy()) {
      const existing = (await this.store.sessions(input.scope)).find(
        (session) => session.topic === input.topic && session.open,
      );
      if (existing && foregroundBusy()) return { ...existing, historyDeferred: true };
    }
    return this.gate.runStartup('open-chat', () => this.openUnlocked(input));
  }
  withSession<T>(
    input: { scope: Scope; topic: string; title: string },
    task: (session: ChatSession) => Promise<T>,
  ): Promise<T> {
    return this.gate.run('prepare-chat', async () => task(await this.openUnlocked(input)));
  }
  private async openUnlocked(input: { scope: Scope; topic: string; title: string }): Promise<ChatSession> {
    return openChatSession(this.store, this.agent, input, (event) => {
      this.notify(event);
    });
  }
  close(id: string): Promise<void> {
    return this.gate.run('close-chat', async () => {
      const session = await this.store.getSession(id);
      session.open = false;
      await this.store.saveSession(session);
    });
  }
  reset(id: string): Promise<ChatSession> {
    return this.gate.run('reset-chat', async () => {
      const session = await this.store.getSession(id);
      session.threadId = null;
      session.messages = [];
      session.checkpoints = [];
      await this.store.saveSession(session);
      return session;
    });
  }
  async start(request: ChatRequest): Promise<void> {
    if (!request.text.trim()) throw new AppFault({ id: 'appMessageEmpty' });
    const release = this.gate.acquire(request.sessionId);
    return this.startWithLease(() => this.store.getSession(request.sessionId), request, release);
  }
  /** The creator transfers its existing lease; accepted execution owns it through final recovery. */
  startOwned(
    input: { scope: Scope; topic: string; title: string },
    request: Omit<ChatRequest, 'sessionId'>,
    release: () => void,
  ): Promise<void> {
    return this.startWithLease(() => this.openUnlocked(input), request, release);
  }
  private async startWithLease(
    loadSession: () => Promise<ChatSession>,
    request: Omit<ChatRequest, 'sessionId'>,
    release: () => void,
  ): Promise<void> {
    let scope: Scope | undefined;
    const preparation = { filesTouched: false, handedOff: false };
    try {
      if (!request.text.trim()) throw new AppFault({ id: 'appMessageEmpty' });
      const session = await loadSession();
      scope = session.scope;
      const prepared = await this.preparation.prepare(
        session,
        { ...request, sessionId: session.id },
        preparation,
      );
      preparation.handedOff = true;
      await this.launch(prepared, release);
    } catch (error) {
      if (scope && preparation.filesTouched && !preparation.handedOff)
        this.notify({ type: 'workspace-changed', scope });
      release();
      throw error;
    }
  }
  async saveScript(input: ScriptInput): Promise<ChatSession> {
    const release = this.gate.acquire('script-handoff');
    const preparation = { filesTouched: false, handedOff: false };
    try {
      const session = await this.openUnlocked({
        scope: input.scope,
        topic: 'creation',
        title: 'Creation workspace',
      });
      const request: ChatRequest = {
        sessionId: session.id,
        text: input.guidance.trim() ? input.guidance : appMessagesEn.scriptHandoff,
        mode: 'edit',
        selection: input.selection,
        attachments: [],
      };
      const prepared = await this.preparation.prepare(session, request, preparation, input);
      preparation.handedOff = true;
      await this.launch(prepared, release);
      return structuredClone(session);
    } catch (error) {
      if (preparation.filesTouched && !preparation.handedOff)
        this.notify({ type: 'workspace-changed', scope: input.scope });
      release();
      throw error;
    }
  }
  private launch(prepared: Prepared, release: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      // The caller receives success only once Codex has accepted a turn. The lease outlives that response.
      void this.execute(prepared, resolve, reject)
        .catch((error: unknown) => {
          this.notify({ type: 'workspace-changed', scope: prepared.session.scope });
          reject(error instanceof Error ? error : new Error(String(error)));
          this.notify({
            type: 'notice',
            code: 'save-failed',
            detail: String(error),
            diagnostic: diagnosticFromError(error),
          });
        })
        .finally(release);
    });
  }
  private async execute(
    prepared: Prepared,
    accepted: () => void,
    rejected: (error: unknown) => void,
  ): Promise<void> {
    const { session, original, heads } = prepared;
    const lifecycle = { started: false };
    let failed = false;
    let uncertainStart = false;
    let startError: unknown;
    let finalSaved = false;
    let persistence = Promise.resolve();
    let persistenceError: unknown;
    const persist = () => {
      const snapshot = structuredClone(session);
      // Catch each write immediately: a transient failure must neither reject in the background nor poison later writes.
      persistence = persistence
        .then(() => this.store.saveSession(snapshot))
        .catch((error: unknown) => {
          persistenceError = error;
        });
    };
    try {
      const result = await this.agent.run(prepared.input, (event) => {
        if (event.type === 'thread') session.threadId = event.threadId;
        if (event.type === 'turn') {
          if (lifecycle.started) return;
          lifecycle.started = true;
          session.checkpoints = [
            ...(session.checkpoints ?? []),
            {
              turnId: event.turnId,
              mode: prepared.request.mode,
              threadId: session.threadId ?? '',
              heads,
              messageCount: original.messages.length,
            },
          ];
          const message = session.messages.at(-1);
          if (message?.role === 'user') message.turnId = event.turnId;
          this.notify({
            type: 'activity',
            activity: { sessionId: session.id, phase: 'working', detail: '' },
          });
          accepted();
        }
        if (event.type === 'message') {
          const index = session.messages.findIndex((message) => message.id === event.message.id);
          if (index < 0) session.messages.push(event.message);
          else session.messages[index] = event.message;
          this.notify({ type: 'chat', sessionId: session.id, message: event.message, delta: event.delta });
        }
        if (event.type === 'warning')
          this.notify({
            type: 'notice',
            code: 'agent-warning',
            detail: event.detail,
            ...(event.diagnostic ? { diagnostic: event.diagnostic } : {}),
          });
        persist();
      });
      if (!lifecycle.started) throw new AppFault({ id: 'appTurnNotAccepted' });
      session.threadId = result.threadId;
      const latest = session.checkpoints?.at(-1);
      if (latest) latest.threadId = result.threadId;
      if (result.status !== 'completed')
        throw new AppFault(
          { id: result.status === 'interrupted' ? 'appOperationInterrupted' : 'appOperationFailed' },
          result.error ?? undefined,
        );
    } catch (error) {
      failed = true;
      startError = error;
      uncertainStart = error instanceof AgentError && error.code === 'uncertain-start';
      if (lifecycle.started || uncertainStart) {
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'error',
          text: error instanceof Error ? error.message : String(error),
          diagnostic: diagnosticFromError(error),
          turnId: null,
          files: [],
          createdAt: new Date().toISOString(),
        };
        session.messages.push(message);
        this.notify({ type: 'chat', sessionId: session.id, message, delta: false });
      }
    }
    await persistence;
    try {
      if (!lifecycle.started && !uncertainStart) {
        await prepared.rollback();
        await this.store.saveSession(original);
      } else {
        this.notify({
          type: 'activity',
          activity: { sessionId: session.id, phase: 'committing', detail: '' },
        });
        await this.commits.reconcile(
          prepared.scope,
          prepared.request.mode === 'edit',
          Object.keys(heads),
          prepared.request.mode === 'edit' ? prepared.sharedScopes : [],
        );
        const latest = lifecycle.started ? session.checkpoints?.at(-1) : undefined;
        if (latest) latest.postHeads = await repositoryHeads(this.git, Object.keys(heads));
        const receipt =
          !failed && prepared.request.mode === 'edit' && latest ? await turnReceipt(this.git, latest) : null;
        if (receipt) session.messages.push(receipt);
        session.updatedAt = new Date().toISOString();
        await this.store.saveSession(session);
        finalSaved = true;
        if (receipt) {
          this.notify({ type: 'chat', sessionId: session.id, message: receipt, delta: false });
        }
      }
    } catch (error) {
      failed = true;
      startError = error;
      this.notify({
        type: 'notice',
        code: 'save-failed',
        detail: String(error),
        diagnostic: diagnosticFromError(error),
      });
    }
    if (persistenceError && finalSaved) {
      const fault = new AppFault({ id: 'appHistorySavedAgain' });
      this.notify({
        type: 'notice',
        code: 'history-recovered',
        detail: fault.message,
        diagnostic: fault.diagnostic,
      });
    }
    this.notify({
      type: 'activity',
      activity: { sessionId: session.id, phase: failed ? 'error' : 'done', detail: '' },
    });
    this.notify({ type: 'workspace-changed', scope: session.scope });
    if (!lifecycle.started) rejected(startError ?? new AppFault({ id: 'appConversationStartFailed' }));
  }
  undo(id: string): Promise<ChatSession> {
    return this.gate.run('undo', () =>
      undoChat(this.store, this.git, this.agent, id, (event) => {
        this.notify(event);
      }),
    );
  }
}
