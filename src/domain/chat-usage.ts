/** Native provider observations only. Missing values never mean an empty allowance. */
export interface ChatContextUsage {
  usedTokens: number;
  maxTokens: number | null;
  totalTokens: number | null;
  observedAt: string;
}
export interface ChatUsageWindow {
  id: 'primary' | 'secondary';
  usedPercent: number;
  durationMinutes: number | null;
  resetsAt: string | null;
}
export interface ChatUsage {
  context: ChatContextUsage | null;
  account: { available: boolean; windows: ChatUsageWindow[]; checkedAt: string };
}
