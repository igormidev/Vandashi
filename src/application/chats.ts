import { undoChat } from './chat-undo';
import { repositoryHeads, turnReceipt } from './turn-receipt';
import type { MediaPort } from '../domain/media';
import type { AgentPort, AgentRunInput } from '../domain/agent';
import { AgentError } from '../domain/agent';
import type { AppEvent, ChatMessage, ChatRequest, ChatSession, Scope, Settings } from '../domain/models';
import { buildWorkspacePrompt } from '../domain/prompts';
import type { GitPort, StoragePort } from '../domain/storage';
import type { Commits } from './commits';
import type { OperationGate } from './operation-gate';

type ScriptInput = {
  scope: Scope;
  revision: string;
  content: string;
  guidance: string;
  selection: Settings['chat'];
};
type Prepared = {
  session: ChatSession;
  original: ChatSession;
  request: ChatRequest;
  input: AgentRunInput;
  heads: Record<string, string>;
  rollback: () => Promise<void>;
};

export class Chats {
  constructor(
    private readonly store: StoragePort,
    private readonly git: GitPort,
    private readonly agent: AgentPort,
    private readonly commits: Commits,
    private readonly gate: OperationGate,
    private readonly emit: (event: AppEvent) => void,
    private readonly media?: MediaPort,
  ) {}
  private notify(event: AppEvent): void {
    try {
      this.emit(event);
    } catch {
      /* Persist even when the window has closed. */
    }
  }
  async open(input: { scope: Scope; topic: string; title: string }): Promise<ChatSession> {
    if (this.gate.busy) {
      const existing = (await this.store.sessions(input.scope)).find(
        (session) => session.topic === input.topic && session.open,
      );
      if (existing) return existing;
    }
    return this.gate.run('open-chat', () => this.openUnlocked(input));
  }
  withSession<T>(
    input: { scope: Scope; topic: string; title: string },
    task: (session: ChatSession) => Promise<T>,
  ): Promise<T> {
    return this.gate.run('prepare-chat', async () => task(await this.openUnlocked(input)));
  }
  private async openUnlocked(input: { scope: Scope; topic: string; title: string }): Promise<ChatSession> {
    const found = (await this.store.sessions(input.scope)).find((session) => session.topic === input.topic);
    const session: ChatSession = found ?? {
      id: crypto.randomUUID(),
      scope: input.scope,
      topic: input.topic,
      title: input.title,
      threadId: null,
      messages: [],
      open: true,
      updatedAt: new Date().toISOString(),
    };
    if (session.threadId) {
      try {
        await this.agent.readThread(session.threadId);
      } catch (error) {
        if (!(error instanceof AgentError) || error.code !== 'missing-history') throw error;
        session.threadId = null;
        this.notify({
          type: 'notice',
          code: 'missing-history',
          detail: 'The previous Codex conversation could not be found. A new conversation will start.',
        });
      }
    }
    session.open = true;
    session.updatedAt = new Date().toISOString();
    await this.store.saveSession(session);
    return session;
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
    if (!request.text.trim()) throw new Error('Enter a message first.');
    const release = this.gate.acquire(request.sessionId);
    let scope: Scope | undefined;
    try {
      const session = await this.store.getSession(request.sessionId);
      scope = session.scope;
      await this.launch(await this.prepare(session, request), release);
    } catch (error) {
      if (scope) this.notify({ type: 'workspace-changed', scope });
      release();
      throw error;
    }
  }
  async saveScript(input: ScriptInput): Promise<ChatSession> {
    const release = this.gate.acquire('script-handoff');
    try {
      const session = await this.openUnlocked({
        scope: input.scope,
        topic: 'creation',
        title: 'Creation workspace',
      });
      const request: ChatRequest = {
        sessionId: session.id,
        text: input.guidance.trim() || 'Implement the staged script changes in the video.',
        mode: 'edit',
        selection: input.selection,
        attachments: [],
      };
      await this.launch(await this.prepare(session, request, input), release);
      return structuredClone(session);
    } catch (error) {
      this.notify({ type: 'workspace-changed', scope: input.scope });
      release();
      throw error;
    }
  }
  private async prepare(session: ChatSession, request: ChatRequest, script?: ScriptInput): Promise<Prepared> {
    const repositories = await this.store.repositories(session.scope);
    if (request.mode === 'edit' && session.scope.videoId) await this.media?.stopStudio();
    for (const repository of repositories)
      if ((await this.git.status(repository)).dirty)
        throw new Error('Save pending file changes before starting AI.');
    const heads = await repositoryHeads(this.git, repositories);
    const cwd = await this.store.projectPath(session.scope);
    const capabilities = await this.agent.capabilities(cwd);
    const skill = capabilities.skills.find((entry) => entry.name === 'hyperframes');
    const original = structuredClone(session);
    const scriptHead = heads[cwd];
    if (script && !scriptHead) throw new Error('The script checkpoint is missing.');
    const originalScript = script && scriptHead ? await this.git.readAt(cwd, scriptHead, 'script.md') : null;
    let staged = false;
    const rollback = async () => {
      if (!staged || !script) return;
      const workspace = await this.store.openWorkspace(session.scope);
      const current = workspace.documents.find((document) => document.kind === 'script');
      if (current?.content !== script.content && current?.content !== originalScript)
        throw new Error(
          'The script changed while AI was starting. The current file was preserved; review it before retrying.',
        );
      const head = heads[cwd];
      if (!head) throw new Error('The script checkpoint is missing. Your staged script was preserved.');
      await this.git.restoreFiles(cwd, head, ['script.md']);
    };
    try {
      if (script) {
        staged = true;
        await this.store.writeScript(script);
        await this.git.stage(cwd, ['script.md']);
      }
      const workspace = await this.store.openWorkspace(session.scope);
      const prompt = buildWorkspacePrompt({
        workspace,
        topic: session.topic,
        mode: request.mode,
        text: request.text,
        scriptStaged: !!script,
        ...(skill ? { hyperframesSkill: skill } : {}),
      });
      const message: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: request.text,
        turnId: null,
        files: [],
        createdAt: new Date().toISOString(),
      };
      session.messages.push(message);
      session.updatedAt = new Date().toISOString();
      await this.store.saveSession(session);
      this.notify({ type: 'chat', sessionId: session.id, message, delta: false });
      this.notify({ type: 'activity', activity: { sessionId: session.id, phase: 'starting', detail: '' } });
      return {
        session,
        original,
        request,
        heads,
        rollback,
        input: {
          threadId: session.threadId,
          cwd,
          mode: request.mode,
          writableRoots: request.mode === 'edit' ? repositories : [],
          selection: request.selection,
          prompt,
          attachments: request.attachments,
        },
      };
    } catch (error) {
      await rollback();
      throw error;
    }
  }
  private launch(prepared: Prepared, release: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      // The caller receives success only once Codex has accepted a turn. The lease outlives that response.
      void this.execute(prepared, resolve, reject)
        .catch((error: unknown) => {
          reject(error instanceof Error ? error : new Error(String(error)));
          this.notify({ type: 'notice', code: 'save-failed', detail: String(error) });
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
          this.notify({ type: 'notice', code: 'agent-warning', detail: event.detail });
        persist();
      });
      if (!lifecycle.started) throw new Error('Codex did not accept a conversation turn.');
      session.threadId = result.threadId;
      const latest = session.checkpoints?.at(-1);
      if (latest) latest.threadId = result.threadId;
      if (result.status !== 'completed')
        throw new Error(result.error ?? 'The operation was interrupted. Your work will be preserved.');
    } catch (error) {
      failed = true;
      startError = error;
      if (lifecycle.started) {
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'error',
          text: error instanceof Error ? error.message : String(error),
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
      if (!lifecycle.started) {
        await prepared.rollback();
        await this.store.saveSession(original);
      } else {
        this.notify({
          type: 'activity',
          activity: { sessionId: session.id, phase: 'committing', detail: '' },
        });
        await this.commits.reconcile(session.scope, prepared.request.mode === 'edit');
        const latest = session.checkpoints?.at(-1);
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
      this.notify({ type: 'notice', code: 'save-failed', detail: String(error) });
    }
    if (persistenceError && finalSaved)
      this.notify({
        type: 'notice',
        code: 'history-recovered',
        detail: 'An earlier conversation save failed. The final state was saved again.',
      });
    this.notify({
      type: 'activity',
      activity: { sessionId: session.id, phase: failed ? 'error' : 'done', detail: '' },
    });
    this.notify({ type: 'workspace-changed', scope: session.scope });
    if (!lifecycle.started) rejected(startError ?? new Error('Could not start the conversation.'));
  }
  undo(id: string): Promise<ChatSession> {
    return this.gate.run('undo', () =>
      undoChat(this.store, this.git, this.agent, id, (event) => {
        this.notify(event);
      }),
    );
  }
}
