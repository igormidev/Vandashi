export type { QueuedChat } from './models';

export interface QueuedChatRemoval {
  sessionId: string;
  id: string;
  /** An explicit discard can resume remaining fresh intents; draft restoration cannot. */
  resume?: boolean;
}

export interface QueuedChatOrder {
  sessionId: string;
  /** Complete ordered IDs from the snapshot the user reviewed. */
  reviewedIds: string[];
  /** A complete permutation of those exact IDs. */
  ids: string[];
}
