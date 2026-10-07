import type { ChatSession, ClipHandoff } from './models';

export interface ChatMessageTarget {
  sessionId: string;
  messageId: string;
}
export interface RewoundChat {
  session: ChatSession;
  draft: {
    text: string;
    mode: 'read' | 'edit';
    collaboration: 'default' | 'plan';
    attachments: string[];
    handoff?: ClipHandoff;
  };
}
