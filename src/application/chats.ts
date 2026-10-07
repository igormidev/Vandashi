import { launchChat } from './chat-launch';
import { publishPending } from './chat-pending';
import { AppFault, diagnosticFromError } from '../domain/diagnostics';
import { undoChat } from './chat-undo';
import { openChatSession } from './chat-history';
import { repositoryHeads, turnReceipt } from './turn-receipt';
import type { MediaPort } from '../domain/media';
import type { OpenedChat } from '../domain/api';
import type { AgentPort } from '../domain/agent';
import type { ChatInputRequest, ChatInputResponse } from '../domain/chat-input';
import { ChatInputs } from './chat-input';
import { receiveChatEvent } from './chat-events';
import { AgentError } from '../domain/agent';
import type { AppEvent, ChatMessage, ChatRequest, ChatSession, Scope } from '../domain/models';
import { appMessagesEn } from '../domain/messages';
import type { GitPort, StoragePort } from '../domain/storage';
import type { Commits } from './commits';
import type { OperationGate } from './operation-gate';
import type { Prepared, ScriptInput } from './chat-types';
import { ChatPreparation } from './chat-preparation';
import type { Transcriptions } from './transcriptions';

export class Chats {
  private readonly preparation: ChatPreparation;
  private readonly inputs: ChatInputs;
  constructor(
    private readonly store: StoragePort,
    private readonly git: GitPort,
    private readonly agent: AgentPort,
    private readonly commits: Commits,
    private readonly gate: OperationGate,
    private readonly emit: (event: AppEvent) => void,
    media?: MediaPort,
    private readonly transcriptions?: Transcriptions,
    private readonly validateAttachments?: (paths: string[]) => Promise<string[]>,
    private readonly settled?: (success: boolean) => void,
  ) {
    this.inputs = new ChatInputs(agent, gate, (event) => {
      this.notify(event);
    });
    this.preparation = new ChatPreparation(
      store,
      git,
      agent,
      commits,
      (event) => {
        this.notify(event);
      },
      media,
      transcriptions,
    );
  }
  private notify(event: AppEvent): void {
    try {
      this.emit(event);
    } catch {
      /* Persist even when the window has closed. */
    }
  }
  pendingInput(sessionId: string): ChatInputRequest | null {
    return this.inputs.pending(sessionId);
  }
  respondInput(response: ChatInputResponse): Promise<void> {
    return this.inputs.respond(response);
  }
  async open(input: { scope: Scope; topic: string; title: string; sessionId?: string }): Promise<OpenedChat> {
    const foregroundBusy = () => this.gate.busy && !this.gate.readingWorkspace;
    if (foregroundBusy()) {
      const existing = (await this.store.sessions(input.scope)).find(
        (session) =>
          session.topic === input.topic &&
          session.open &&
          (input.sessionId ? session.id === input.sessionId : !session.branch),
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
  private async openUnlocked(input: {
    scope: Scope;
    topic: string;
    title: string;
    sessionId?: string;
  }): Promise<ChatSession> {
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
    publishPending(
      (event) => {
        this.notify(event);
      },
      request,
      'sending',
    );
    return this.startWithLease(() => this.store.getSession(request.sessionId), request, release).catch(
      (error: unknown) => {
        publishPending(
          (event) => {
            this.notify(event);
          },
          request,
          null,
        );
        throw error;
      },
    );
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
      if (
        request.clientMessageId &&
        session.messages.some((message) => message.id === request.clientMessageId)
      )
        throw new AppFault({ id: 'untrustedRequest' });
      if (this.validateAttachments)
        request = { ...request, attachments: await this.validateAttachments(request.attachments) };
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
    return launchChat(
      prepared,
      (accepted, rejected) => this.execute(prepared, accepted, rejected),
      release,
      (event) => {
        this.notify(event);
      },
      this.settled,
    );
  }
  private async execute(
    prepared: Prepared,
    accepted: () => void,
    rejected: (error: unknown) => void,
  ): Promise<boolean> {
    const { session, original, heads } = prepared;
    const inputRun = this.inputs.begin(session.id, session.threadId);
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
      const observer = {
        prepared,
        lifecycle,
        inputRun,
        inputs: this.inputs,
        accepted,
        notify: (event: AppEvent) => {
          this.notify(event);
        },
      };
      const result = await this.agent.run({ ...prepared.input, interactive: true }, (event) => {
        if (receiveChatEvent(observer, event)) persist();
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
    } finally {
      this.inputs.end(inputRun);
    }
    await persistence;
    try {
      if (!lifecycle.started && !uncertainStart) {
        await prepared.rollback();
        await this.store.saveSession(original);
      } else if (prepared.input.purpose === 'host-setup') {
        // Host installs have no Git receipt or reversible project checkpoint.
        await this.agent.refreshConfiguration?.();
        session.checkpoints = original.checkpoints ?? [];
        session.updatedAt = new Date().toISOString();
        await this.store.saveSession(session);
        finalSaved = true;
      } else {
        const transcriptions = this.transcriptions;
        this.notify({
          type: 'activity',
          activity: { sessionId: session.id, phase: 'committing', detail: '' },
        });
        await this.commits.reconcile(
          prepared.scope,
          prepared.request.mode === 'edit',
          Object.keys(heads),
          prepared.request.mode === 'edit' ? prepared.sharedScopes : [],
          prepared.request.mode === 'edit' && transcriptions
            ? () => transcriptions.reconcileRepositories(Object.keys(heads))
            : undefined,
        );
        if (!failed) await prepared.discardGenerationStage?.();
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
    if (prepared.input.purpose !== 'host-setup')
      this.notify({ type: 'workspace-changed', scope: session.scope });
    if (!lifecycle.started) rejected(startError ?? new AppFault({ id: 'appConversationStartFailed' }));
    return !failed;
  }
  undo(id: string): Promise<ChatSession> {
    return this.gate.run('undo', () =>
      undoChat(this.store, this.git, this.agent, id, (event) => {
        this.notify(event);
      }),
    );
  }
}
