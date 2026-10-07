import type { ClipHandoff } from '../../../domain/models';
export interface ComposerAction {
  text: string;
  replace?: boolean;
  mode?: 'read' | 'edit';
  collaboration?: 'default' | 'plan';
  attachments?: string[];
  handoff?: ClipHandoff;
  submit?: boolean;
}
interface Handler {
  insert: (action: ComposerAction) => boolean;
  restore: (prepare: () => Promise<ComposerAction>) => Promise<boolean>;
}
const handlers = new Map<string, Handler>();

/** Commands are scoped to the mounted conversation; no draft crosses a tab boundary. */
export function registerComposerActions(sessionId: string, handler: Handler): () => void {
  handlers.set(sessionId, handler);
  return () => {
    if (handlers.get(sessionId) === handler) handlers.delete(sessionId);
  };
}
export function insertComposerText(sessionId: string, action: ComposerAction): boolean {
  return handlers.get(sessionId)?.insert(action) ?? false;
}
export function restoreComposerDraft(
  sessionId: string,
  prepare: () => Promise<ComposerAction>,
): Promise<boolean> {
  return handlers.get(sessionId)?.restore(prepare) ?? Promise.resolve(false);
}

export function quotedText(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}
