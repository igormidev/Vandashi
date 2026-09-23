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
import type { ModelInfo } from '../../domain/models';
import { loadCapabilities, loadModels, status } from './discovery';
import { executeTurn } from './execution';
import { readHistory } from './history';
import { threadConfiguration } from './policy';
import { missingHistory, object, string, threadResponse } from './schemas';
import type { CodexModel } from './schemas';
import { CodexTransport } from './transport';
import type { RpcClient } from './transport';

export interface CodexConnection {
  client: RpcClient;
  version: string;
}
export interface CodexAgentOptions {
  binary?: string;
  transportFactory?: () => Promise<CodexConnection>;
}
export class CodexAgent implements AgentPort {
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
          'You are the assistant inside Vandashi, a local video studio. Follow the per-message workspace guidance. Do not spawn other agents. Ask questions in your reply when input is needed. Never request unrestricted filesystem access.',
      }),
    );
    this.loadedThreads.add(response.thread.id);
    return response.thread.id;
  }
  async readThread(threadId: string): Promise<AgentThread> {
    const { client } = await this.ensureConnection();
    return readHistory(client, threadId);
  }
  async run(input: AgentRunInput, onEvent: (event: AgentEvent) => void): Promise<AgentRunResult> {
    if (this.running) throw new AgentError('busy', 'Another AI operation is already running.');
    this.running = true;
    this.stopRequested = false;
    try {
      const { client } = await this.connectionForMode(input.mode);
      if (!this.rawModels.length) await this.models();
      const model = this.rawModels.find((entry) => entry.model === input.selection.model);
      if (!model)
        throw new AgentError('unavailable', `The selected model is unavailable: ${input.selection.model}`);
      if (
        !model.supportedReasoningEfforts.some((entry) => entry.reasoningEffort === input.selection.reasoning)
      ) {
        throw new AgentError(
          'unavailable',
          `The selected reasoning level is unavailable for ${model.displayName}.`,
        );
      }
      if (
        input.selection.fast &&
        !model.serviceTiers.some((entry) => entry.id === 'priority') &&
        !model.additionalSpeedTiers.includes('fast')
      ) {
        throw new AgentError('unavailable', `Fast mode is unavailable for ${model.displayName}.`);
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
        onEvent,
        onTurn: (turnId) => {
          this.active = { threadId, turnId };
          if (this.wasStopped())
            void this.stop().catch((error: unknown) => {
              onEvent({ type: 'warning', detail: error instanceof Error ? error.message : String(error) });
            });
        },
      });
    } finally {
      this.running = false;
      this.active = null;
    }
  }
  async forkBefore(threadId: string, turnId: string): Promise<AgentThread> {
    if (this.running) throw new AgentError('busy', 'Wait for the active AI operation before undoing.');
    const { client } = await this.ensureConnection();
    try {
      const response = threadResponse.parse(
        await client.request('thread/fork', { threadId, beforeTurnId: turnId, excludeTurns: true }),
      );
      return await readHistory(client, response.thread.id);
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
    if (connection)
      void connection
        .then(({ client }) => {
          client.close();
        })
        .catch(() => undefined);
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
      return { client, version: string(initialized['userAgent']) };
    } catch (error) {
      client.close();
      throw error;
    }
  }
}
