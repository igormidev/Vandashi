/** Provider-owned activity data; presentation never determines capabilities or file grants. */
export interface ChatItemActivity {
  kind:
    | 'command'
    | 'read'
    | 'search'
    | 'file-change'
    | 'mcp'
    | 'dynamic'
    | 'browser'
    | 'web-search'
    | 'image-generation'
    | 'agent'
    | 'plan'
    | 'compaction'
    | 'review';
  status: 'inProgress' | 'completed' | 'failed' | 'declined' | 'interrupted';
  title?: string;
  detail?: string;
  command?: string;
  cwd?: string;
  exitCode?: number;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  steps?: { text: string; status: 'pending' | 'inProgress' | 'completed' }[];
  agents?: { id: string; name: string; status: 'pending' | ChatItemActivity['status']; result: string }[];
}
