import { installManagedSkills } from './managed-skills';
import {
  setupDeveloperInstructions,
  workspaceDeveloperInstructions,
} from '../../domain/system-prompts/provider';
import type {
  AgentCapabilities,
  AgentEvent,
  AgentPort,
  AgentRunInput,
  AgentRunResult,
  AgentStatus,
  AgentThread,
  AgentThreadOptions,
} from '../../domain/agent';
import { AgentError } from '../../domain/agent';
import { diagnosticFromError } from '../../domain/diagnostics';
import type { AgentInputResponse } from '../../domain/chat-input';
import type { ChatContextUsage, ChatUsage } from '../../domain/chat-usage';
import type { ModelInfo } from '../../domain/models';
import { loadCapabilities, loadModels, status } from './discovery';
import { executeTurn } from './execution';
import { readHistory } from './history';
import { forkHistory } from './fork';
import { CodexImageArtifacts } from './image-artifacts';
import { threadConfiguration } from './policy';
import { missingHistory, object, string, threadResponse } from './schemas';
import type { CodexModel } from './schemas';
import { CodexTransport } from './transport';
import type { RpcClient } from './transport';
import { CodexUsage } from './usage';
import { compactContext } from './compaction';

export interface CodexConnection {
  client: RpcClient;
  version: string;
  codexHome?: string;
}
export interface CodexAgentOptions {
  binary?: string;
  transportFactory?: () => Promise<CodexConnection>;
}
export class CodexAgent implements AgentPort {
  private readonly usageListeners = new Set<(threadId: string, context: ChatContextUsage) => void>();
  private readonly usageState = new CodexUsage((threadId, context) => {
    for (const listener of this.usageListeners) listener(threadId, context);
  });
  private readonly images = new CodexImageArtifacts();
  private connection: Promise<CodexConnection> | null = null;
  private rawModels: CodexModel[] = [];
  private readonly loadedThreads = new Set<string>();
  private generation = 0;
  private running = false;
  private active: { threadId: string; turnId: string } | null = null;
  private lastMode: string | null = null;
  private stopRequested = false;
  constructor(private readonly options: CodexAgentOptions = {}) {}
  async connect(): Promise<AgentStatus> {
    const connection = await this.ensureConnection();
    return status(connection.client, connection.version);
  }
  async models(): Promise<ModelInfo[]> {
    const { client } = await this.ensureConnection();
    const result = await loadModels(client);
    this.rawModels = result.raw;
    return result.models;
  }
  async capabilities(cwd: string): Promise<AgentCapabilities> {
    const { client } = await this.ensureConnection();
    return loadCapabilities(client, cwd);
  }
  async createThread(options: AgentThreadOptions): Promise<string> {
    const { client } = await this.connectionForMode(options);
    const config = await threadConfiguration(client, options);
    const response = threadResponse.parse(
      await client.request('thread/start', {
        ...config,
        historyMode: 'paginated',
        ephemeral: false,
        developerInstructions:
          options.purpose === 'host-setup' ? setupDeveloperInstructions : workspaceDeveloperInstructions,
      }),
    );
    this.loadedThreads.add(response.thread.id);
    return response.thread.id;
  }
  async readThread(threadId: string): Promise<AgentThread> {
    const { client, codexHome } = await this.ensureConnection();
    const history = await readHistory(client, threadId);
    if (history.id !== threadId) throw new AgentError('protocol', { id: 'codexDifferentThread' });
    for (const message of history.messages) this.images.observe(codexHome, threadId, message);
    return history;
  }
  generatedImage(path: string): Promise<string | null> {
    return this.images.resolve(path);
  }
  async run(input: AgentRunInput, onEvent: (event: AgentEvent) => void): Promise<AgentRunResult> {
    if (this.running) throw new AgentError('busy', { id: 'codexBusy' });
    this.running = true;
    this.stopRequested = false;
    try {
      const { client, codexHome } = await this.connectionForMode(input);
      if (!this.rawModels.length) await this.models();
      const model = this.rawModels.find((entry) => entry.model === input.selection.model);
      if (!model)
        throw new AgentError('unavailable', {
          id: 'codexModelUnavailable',
          params: { model: input.selection.model },
        });
      if (
        !model.supportedReasoningEfforts.some((entry) => entry.reasoningEffort === input.selection.reasoning)
      ) {
        throw new AgentError('unavailable', {
          id: 'codexReasoningUnavailable',
          params: { model: model.displayName },
        });
      }
      if (
        input.selection.fast &&
        !model.serviceTiers.some((entry) => entry.id === 'priority') &&
        !model.additionalSpeedTiers.includes('fast')
      ) {
        throw new AgentError('unavailable', {
          id: 'codexFastUnavailable',
          params: { model: model.displayName },
        });
      }
      const threadId = input.threadId ?? (await this.createThread(input));
      if (input.threadId && !this.loadedThreads.has(input.threadId)) {
        try {
          await client.request('thread/resume', {
            threadId,
            excludeTurns: true,
            ...(await threadConfiguration(client, input)),
          });
          this.loadedThreads.add(threadId);
        } catch (error) {
          missingHistory(error);
        }
      }
      onEvent({ type: 'thread', threadId });
      if (this.wasStopped()) return { threadId, turnId: '', status: 'interrupted', output: '', error: null };
      return await executeTurn(client, threadId, input, {
        supportsImages: model.inputModalities.includes('image'),
        onEvent: (event) => {
          if (event.type === 'message') this.images.observe(codexHome, threadId, event.message);
          onEvent(event);
        },
        onTurn: (turnId) => {
          this.active = { threadId, turnId };
          if (this.wasStopped())
            void this.stop().catch((error: unknown) => {
              onEvent({
                type: 'warning',
                detail: error instanceof Error ? error.message : String(error),
                diagnostic: diagnosticFromError(error),
              });
            });
        },
      });
    } finally {
      this.running = false;
      this.active = null;
    }
  }
  async forkBefore(threadId: string, turnId: string): Promise<AgentThread> {
    if (this.running) throw new AgentError('busy', { id: 'codexWaitBeforeUndo' });
    const { client } = await this.ensureConnection();
    try {
      const fork = await forkHistory(client, threadId, turnId, 'before');
      return await this.readThread(fork.id);
    } catch (error) {
      return missingHistory(error);
    }
  }
  async forkThrough(threadId: string, turnId: string): Promise<AgentThread> {
    if (this.running) throw new AgentError('busy', { id: 'codexWaitBeforeUndo' });
    const { client } = await this.ensureConnection();
    const fork = await forkHistory(client, threadId, turnId, 'through');
    return this.readThread(fork.id);
  }
  async stop(): Promise<void> {
    this.stopRequested = true;
    if (!this.active) return;
    const { client } = await this.ensureConnection();
    client.dismissUserInput?.(this.active.threadId, this.active.turnId);
    await client.request('turn/interrupt', this.active);
  }
  async respondUserInput(response: AgentInputResponse): Promise<void> {
    if (
      !this.running ||
      this.stopRequested ||
      this.active?.threadId !== response.threadId ||
      this.active.turnId !== response.turnId
    )
      throw new AgentError('protocol', { id: 'untrustedRequest' });
    const { client } = await this.ensureConnection();
    if (!client.respondUserInput) throw new AgentError('protocol', { id: 'untrustedRequest' });
    await client.respondUserInput(response);
  }
  async usage(threadId: string | null): Promise<ChatUsage> {
    const { client } = await this.ensureConnection();
    return this.usageState.read(client, threadId);
  }
  subscribeUsage(listener: (threadId: string, context: ChatContextUsage) => void): () => void {
    this.usageListeners.add(listener);
    return () => this.usageListeners.delete(listener);
  }
  async compactThread(
    threadId: string,
    options: AgentThreadOptions,
    onEvent: (event: AgentEvent) => void,
  ): Promise<void> {
    if (this.running) throw new AgentError('busy', { id: 'codexBusy' });
    if (options.mode !== 'read' || options.purpose || options.writableRoots.length)
      throw new AgentError('protocol', { id: 'untrustedRequest' });
    this.running = true;
    this.stopRequested = false;
    try {
      const { client } = await this.connectionForMode(options);
      await client.request('thread/resume', {
        threadId,
        excludeTurns: true,
        ...(await threadConfiguration(client, options)),
      });
      this.loadedThreads.add(threadId);
      if (this.wasStopped()) throw new AgentError('protocol', { id: 'appOperationInterrupted' });
      await compactContext(client, threadId, onEvent, (turnId) => {
        this.active = { threadId, turnId };
        if (this.wasStopped())
          void this.stop().catch((error: unknown) => {
            onEvent({
              type: 'warning',
              detail: error instanceof Error ? error.message : String(error),
              diagnostic: diagnosticFromError(error),
            });
          });
      });
    } finally {
      this.running = false;
      this.active = null;
    }
  }
  dispose(): void {
    const connection = this.connection;
    this.generation++;
    this.connection = null;
    this.rawModels = [];
    this.lastMode = null;
    this.loadedThreads.clear();
    this.usageState.clear();
    if (connection) void connection.then(({ client }) => client.close()).catch(() => undefined);
  }
  async refreshConfiguration(): Promise<void> {
    // Setup may change enabled skills/plugins. Await shutdown before a fresh discovery connection.
    const connection = this.connection;
    this.dispose();
    if (connection) await (await connection).client.close();
  }
  private async connectionForMode(options: AgentThreadOptions): Promise<CodexConnection> {
    const mode = `${options.mode}:${options.purpose ?? 'workspace'}`;
    // Rebuild tool capabilities when mode changes; a loaded thread may retain old MCP policy.
    if (this.lastMode && this.lastMode !== mode) this.dispose();
    this.lastMode = mode;
    return this.ensureConnection();
  }
  private wasStopped(): boolean {
    return this.stopRequested;
  }
  private ensureConnection(): Promise<CodexConnection> {
    if (!this.connection) {
      const generation = ++this.generation;
      this.connection = this.startConnection(generation).catch((error: unknown) => {
        if (generation === this.generation) this.connection = null;
        throw error;
      });
    }
    return this.connection;
  }
  private async startConnection(generation: number): Promise<CodexConnection> {
    if (this.options.transportFactory) {
      const connection = await this.options.transportFactory();
      connection.client.subscribe((event) => {
        if (generation === this.generation) this.usageState.observe(event);
      });
      return connection;
    }
    const client = new CodexTransport(this.options.binary);
    try {
      const initialized = object(await client.initialize());
      client.onFailure(() => {
        if (generation === this.generation) {
          this.connection = null;
          this.rawModels = [];
          this.loadedThreads.clear();
          this.usageState.clear();
        }
      });
      client.subscribe((event) => {
        if (generation === this.generation) this.usageState.observe(event);
      });
      const codexHome = string(initialized['codexHome']);
      if (codexHome) await installManagedSkills(codexHome);
      return { client, version: string(initialized['userAgent']), ...(codexHome ? { codexHome } : {}) };
    } catch (error) {
      await client.close();
      throw error;
    }
  }
}
