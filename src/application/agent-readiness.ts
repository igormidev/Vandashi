import type { AgentStatus } from '../domain/agent';
import { AppFault } from '../domain/diagnostics';

export function agentReadinessFault(status: AgentStatus): AppFault | null {
  return !status.connected
    ? new AppFault({ id: 'codexDisconnected' })
    : !status.authenticated
      ? new AppFault({ id: 'appCodexLoginRequired' })
      : status.usageAllowed === false
        ? new AppFault({ id: 'appUsageExhausted' })
        : status.accountType === 'chatgpt' && status.usageAllowed === null
          ? new AppFault({ id: 'appUsageUnverified' })
          : null;
}
