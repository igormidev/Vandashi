import type { Scope } from './models';

export type { ChatPromptSnapshot } from './chat-prompt-snapshot';

export interface PromptReference {
  id: string;
  start: number;
  end: number;
  label: string;
  readable: boolean;
  kind: 'guide' | 'config' | 'file' | 'directory';
}
export interface PromptDocument {
  id: string;
  title: string;
  path?: string;
  text: string;
  references: PromptReference[];
}
export interface ChatPromptInspection {
  id: string;
  preview: PromptDocument;
  developerTemplate: PromptDocument;
  snapshots: { messageId: string; createdAt: string; hasDeveloper: boolean }[];
  mode: 'read' | 'edit';
  collaboration: 'default' | 'plan';
  hasLegacyMessages: boolean;
  skillsAvailable: boolean;
}
export interface ChatPromptRequest {
  sessionId: string;
  mode: 'read' | 'edit';
  collaboration: 'default' | 'plan';
}
/** Native text reads have their own narrow authority; they never grant media/attachment access. */
export interface PromptFilesPort {
  resolve(reference: string, directory: string): string | null;
  directory(path: string): string;
  readable(path: string): boolean;
  authorized(path: string, roots: string[], exactPaths: string[]): boolean;
  read(path: string, roots: string[], exactPaths: string[]): Promise<string>;
}
export interface PromptInspectionOwner {
  sessionId: string;
  scope: Scope;
  topic: string;
}
