import type { ChatMessage, ModelInfo, ModelSelection } from './models';

export interface AgentStatus {
  connected: boolean;
  authenticated: boolean;
  accountType: string | null;
  usageAllowed: boolean | null;
  version: string;
}
export interface AgentSkill {
  name: string;
  path: string;
  description: string;
}
export interface AgentCapabilities {
  skills: AgentSkill[];
  plugins: { id: string; name: string; enabled: boolean }[];
  browserTools?: string[];
}
export interface AgentThreadOptions {
  cwd: string;
  mode: 'read' | 'edit';
  writableRoots: string[];
  selection: ModelSelection;
}
export interface AgentThread {
  id: string;
  messages: ChatMessage[];
  turnIds: string[];
}
export type AgentEvent =
  | { type: 'thread'; threadId: string }
  | { type: 'turn'; turnId: string }
  | { type: 'message'; message: ChatMessage; delta: boolean }
  | { type: 'warning'; detail: string };
export interface AgentRunInput extends AgentThreadOptions {
  threadId: string | null;
  prompt: string;
  attachments: string[];
  outputSchema?: Record<string, unknown>;
}
export interface AgentRunResult {
  threadId: string;
  turnId: string;
  status: 'completed' | 'interrupted' | 'failed';
  output: string;
  error: string | null;
}
export interface AgentPort {
  connect(): Promise<AgentStatus>;
  models(): Promise<ModelInfo[]>;
  capabilities(cwd: string): Promise<AgentCapabilities>;
  createThread(options: AgentThreadOptions): Promise<string>;
  readThread(threadId: string): Promise<AgentThread>;
  run(input: AgentRunInput, onEvent: (event: AgentEvent) => void): Promise<AgentRunResult>;
  forkBefore(threadId: string, turnId: string): Promise<AgentThread>;
  stop(): Promise<void>;
  dispose(): void;
}
export class AgentError extends Error {
  constructor(
    readonly code: 'unavailable' | 'authentication' | 'missing-history' | 'busy' | 'protocol' | 'timeout',
    message: string,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}
