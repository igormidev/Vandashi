import type { AgentRunInput } from '../domain/agent';
import type { ChatRequest, ChatSession, Scope, Settings } from '../domain/models';

export interface ScriptInput {
  scope: Scope;
  revision: string;
  content: string;
  guidance: string;
  selection: Settings['chat'];
}
export interface Prepared {
  session: ChatSession;
  original: ChatSession;
  request: ChatRequest;
  input: AgentRunInput;
  scope: Scope;
  sharedScopes: Scope[];
  heads: Record<string, string>;
  rollback: () => Promise<void>;
}
