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
import type { ModelInfo } from '../../domain/models';
import { loadCapabilities, loadModels, status } from './discovery';
import { executeTurn } from './execution';
import { readHistory } from './history';
import { CodexImageArtifacts } from './image-artifacts';
import { threadConfiguration } from './policy';
import { missingHistory, object, string, threadResponse } from './schemas';
import type { CodexModel } from './schemas';
import { CodexTransport } from './transport';
import type { RpcClient } from './transport';

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
  private readonly images = new CodexImageArtifacts();
  private connection: Promise<CodexConnection> | null = null;
  private rawModels: CodexModel[] = [];
  private readonly loadedThreads = new Set<string>();
  private generation = 0;
  private running = false;
  private active: { threadId: string; turnId: string } | null = null;
  private lastMode: AgentThreadOptions['mode'] | null = null;
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
    const { client } = await this.connectionForMode(options.mode);
    const config = await threadConfiguration(client, options);
    const response = threadResponse.parse(
      await client.request('thread/start', {
        ...config,
        historyMode: 'paginated',
        ephemeral: false,
        developerInstructions:
          'You are the assistant inside Vandashi, a local video studio. Follow the per-message workspace guidance. MANDATORY: before adding or replacing any audio/video asset, read the app-owned transcription README identified in that guidance, run its exact command, and verify the saved category and transcript or explicit music/effects exemption. Never invent metadata evidence. Before editing audio/video or captions, read its saved source timestamps; later edits depend on them. Report media kind and verified preparation status. Do not spawn other agents. Ask questions in your reply when input is needed. Never request unrestricted filesystem access.',
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
      const { client, codexHome } = await this.connectionForMode(input.mode);
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
      const response = threadResponse.parse(
        await client.request('thread/fork', { threadId, beforeTurnId: turnId, excludeTurns: true }),
      );
      return await this.readThread(response.thread.id);
    } catch (error) {
      return missingHistory(error);
    }
  }
  async stop(): Promise<void> {
    this.stopRequested = true;
    if (!this.active) return;
    const { client } = await this.ensureConnection();
    await client.request('turn/interrupt', this.active);
  }
  dispose(): void {
    const connection = this.connection;
    this.generation++;
    this.connection = null;
    this.rawModels = [];
    this.lastMode = null;
    this.loadedThreads.clear();
    if (connection) void connection.then(({ client }) => client.close()).catch(() => undefined);
  }
  private async connectionForMode(mode: AgentThreadOptions['mode']): Promise<CodexConnection> {
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
    if (this.options.transportFactory) return this.options.transportFactory();
    const client = new CodexTransport(this.options.binary);
    try {
      const initialized = object(await client.initialize());
      client.onFailure(() => {
        if (generation === this.generation) {
          this.connection = null;
          this.rawModels = [];
          this.loadedThreads.clear();
        }
      });
      const codexHome = string(initialized['codexHome']);
      return { client, version: string(initialized['userAgent']), ...(codexHome ? { codexHome } : {}) };
    } catch (error) {
      await client.close();
      throw error;
    }
  }
}
