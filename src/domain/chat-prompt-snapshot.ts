/** App-owned guidance only. User content is never folded into this audit record. */
export interface ChatPromptSnapshot {
  guidance: string;
  mode: 'read' | 'edit';
  collaboration: 'default' | 'plan';
  /** Captured only when Vandashi starts a new provider thread. */
  developerInstructions?: string;
}
