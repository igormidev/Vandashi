import type { AgentPort } from '../domain/agent';
import type { ChatUsage } from '../domain/chat-usage';
import { AppFault, diagnosticFromError } from '../domain/diagnostics';
import type { AppEvent } from '../domain/models';
import type { GitPort, StoragePort } from '../domain/storage';
import { agentReadinessFault } from './agent-readiness';
import type { OperationGate } from './operation-gate';

/** Context observations are ephemeral; manual compaction preserves project bytes and app receipts. */
export class ChatUsageService {
  private readonly reading = new Map<string, Promise<ChatUsage>>();
  private readonly sessionsByThread = new Map<string, string>();
  private readonly knownSessions = new Set<string>();
  constructor(
    private readonly store: StoragePort,
    private readonly git: GitPort,
    private readonly agent: AgentPort,
    private readonly gate: OperationGate,
    private readonly hasQueue: () => boolean,
    private readonly emit: (event: AppEvent) => void,
  ) {
    agent.subscribeUsage?.((threadId, context) => {
      const matched = this.sessionsByThread.get(threadId);
      for (const id of matched ? [matched] : this.knownSessions)
        void this.store.getSession(id).then(
          (session) => {
            if (!session.open || session.threadId !== threadId) return;
            this.sessionsByThread.set(threadId, session.id);
            this.emit({ type: 'chat-usage', sessionId: session.id, context });
          },
          () => undefined,
        );
    });
  }
  read(sessionId: string): Promise<ChatUsage> {
    const existing = this.reading.get(sessionId);
    if (existing) return existing;
    const promise = this.readFresh(sessionId).finally(() => {
      if (this.reading.get(sessionId) === promise) this.reading.delete(sessionId);
    });
    this.reading.set(sessionId, promise);
    return promise;
  }
  private async readFresh(sessionId: string): Promise<ChatUsage> {
    const session = await this.store.getSession(sessionId);
    this.knownSessions.add(session.id);
    for (const [threadId, id] of this.sessionsByThread)
      if (id === session.id && threadId !== session.threadId) this.sessionsByThread.delete(threadId);
    if (session.threadId) this.sessionsByThread.set(session.threadId, session.id);
    if (!this.agent.usage)
      return {
        context: null,
        account: { available: false, windows: [], checkedAt: new Date().toISOString() },
      };
    return this.agent.usage(session.threadId);
  }
  compact(sessionId: string): Promise<void> {
    return this.gate.run(sessionId, async () => {
      if (this.hasQueue() || !this.agent.compactThread) throw new AppFault({ id: 'appOperationBusy' });
      const session = await this.store.getSession(sessionId);
      if (!session.threadId || /^(?:setup:|publish:)/u.test(session.topic))
        throw new AppFault({ id: 'untrustedRequest' });
      const paths = await this.store.discoverAgentScope(session.scope);
      for (const repository of paths.repositories)
        if ((await this.git.status(repository)).dirty) throw new AppFault({ id: 'appSaveBeforeAi' });
      const fault = agentReadinessFault(await this.agent.connect());
      if (fault) throw fault;
      const preferred = (await this.store.getState()).settings.chat;
      const models = await this.agent.models();
      const model =
        models.find((entry) => entry.id === preferred.model) ??
        models.find((entry) => entry.isDefault) ??
        models[0];
      if (!model) throw new AppFault({ id: 'codexModelUnavailable', params: { model: preferred.model } });
      const selection = {
        model: model.id,
        reasoning: model.reasoning.includes(preferred.reasoning)
          ? preferred.reasoning
          : model.defaultReasoning,
        fast: preferred.fast && model.fast,
      };
      if (this.hasQueue()) throw new AppFault({ id: 'appOperationBusy' });
      let persistence = Promise.resolve();
      let failedWrite: Error | null = null;
      const persist = () => {
        const snapshot = structuredClone(session);
        persistence = persistence
          .then(() => this.store.saveSession(snapshot))
          .catch((error: unknown) => {
            failedWrite = error instanceof Error ? error : new Error(String(error));
          });
      };
      let failed: Error | null = null;
      try {
        await this.agent.compactThread(
          session.threadId,
          { cwd: paths.cwd, mode: 'read', writableRoots: [], selection },
          (event) => {
            if (event.type === 'warning')
              this.emit({
                type: 'notice',
                code: 'agent-warning',
                detail: event.detail,
                ...(event.diagnostic ? { diagnostic: event.diagnostic } : {}),
              });
            if (event.type !== 'message') return;
            const index = session.messages.findIndex((message) => message.id === event.message.id);
            if (index < 0) session.messages.push(event.message);
            else session.messages[index] = event.message;
            this.emit({ type: 'chat', sessionId, message: event.message, delta: false });
            persist();
          },
        );
      } catch (error) {
        failed = error instanceof Error ? error : new Error(String(error));
      }
      await persistence;
      session.updatedAt = new Date().toISOString();
      try {
        await this.store.saveSession(session);
      } catch (error) {
        failedWrite = error instanceof Error ? error : new Error(String(error));
      }
      if (failedWrite) throw failedWrite;
      if (failed) {
        this.emit({
          type: 'notice',
          code: 'agent-warning',
          detail: '',
          diagnostic: diagnosticFromError(failed),
        });
        throw failed;
      }
    });
  }
}
