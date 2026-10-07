import type { ChatItemActivity } from '../../domain/models';
import { array, object, string } from './schemas';
import type { CodexItem } from './schemas';

const MAX_DETAIL = 64 * 1024;
function toolKind(server: string, tool: string, fallback: 'mcp' | 'dynamic'): ChatItemActivity['kind'] {
  return /^(?:browser|playwright|chrome-devtools)$/.test(server) ||
    /^(?:browser_|mcp__(?:browser|playwright)__)/.test(tool)
    ? 'browser'
    : fallback;
}
function agentStatus(value: unknown): NonNullable<ChatItemActivity['agents']>[number]['status'] {
  if (value === 'pendingInit') return 'pending';
  if (value === 'running' || value === 'started' || value === 'interacted') return 'inProgress';
  if (value === 'errored' || value === 'notFound') return 'failed';
  if (value === 'shutdown') return 'interrupted';
  return activityStatus(value);
}
function agentStates(item: CodexItem): NonNullable<ChatItemActivity['agents']> {
  const states = object(item['agentsStates']);
  const ids = new Set([
    ...Object.keys(states),
    ...array(item['receiverThreadIds']).filter((id): id is string => typeof id === 'string'),
  ]);
  return [...ids].map((id) => {
    const state = object(states[id]);
    return {
      id,
      name: string(state['name']) || id,
      status: states[id] ? agentStatus(state['status']) : 'pending',
      result: string(state['message']).slice(-MAX_DETAIL),
    };
  });
}
export function activityStatus(value: unknown): ChatItemActivity['status'] {
  return value === 'inProgress' || value === 'failed' || value === 'declined' || value === 'interrupted'
    ? value
    : 'completed';
}
export function planSteps(value: unknown): NonNullable<ChatItemActivity['steps']> {
  return array(value).flatMap((entry) => {
    const step = object(entry);
    const text = string(step['step']);
    return text
      ? [
          {
            text,
            status:
              step['status'] === 'completed' || step['status'] === 'inProgress' ? step['status'] : 'pending',
          } as const,
        ]
      : [];
  });
}
function commandKind(command: string): ChatItemActivity['kind'] {
  // Decoration only: this never grants permissions or changes command execution.
  const unwrapped = command
    .replace(/^\s*(?:\/(?:[^\s/]+\/)*|)(?:bash|zsh|sh)\s+-(?:lc|cl|c)\s+['"]/, '')
    .trim();
  if (/^(?:cat|head|tail|sed|less|more|wc)\b/.test(unwrapped)) return 'read';
  if (/^(?:rg|grep|find|fd|ls)\b/.test(unwrapped)) return 'search';
  return 'command';
}
export function itemActivity(item: CodexItem): ChatItemActivity | undefined {
  const status = activityStatus(item['status']);
  const base = { status };
  switch (item.type) {
    case 'commandExecution': {
      const command = string(item['command']);
      const exitCode = typeof item['exitCode'] === 'number' ? item['exitCode'] : undefined;
      const durationMs = typeof item['durationMs'] === 'number' ? item['durationMs'] : undefined;
      return {
        ...base,
        kind: commandKind(command),
        command,
        cwd: string(item['cwd']),
        detail: string(item['aggregatedOutput']).slice(-MAX_DETAIL),
        ...(exitCode === undefined ? {} : { exitCode }),
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(exitCode !== undefined && exitCode !== 0 ? { status: 'failed' } : {}),
      };
    }
    case 'fileChange':
      return { ...base, kind: 'file-change' };
    case 'mcpToolCall':
      return {
        ...base,
        kind: toolKind(string(item['server']), string(item['tool']), 'mcp'),
        title: `${string(item['server'])}/${string(item['tool'])}`,
        detail: JSON.stringify(
          { arguments: item['arguments'], result: item['result'], error: item['error'] },
          null,
          2,
        ).slice(-MAX_DETAIL),
        ...(item['error'] ? { status: 'failed' } : {}),
      };
    case 'dynamicToolCall':
      return {
        ...base,
        kind: toolKind('', string(item['tool']), 'dynamic'),
        title: string(item['tool']),
        detail: JSON.stringify(
          { arguments: item['arguments'], contentItems: item['contentItems'] },
          null,
          2,
        ).slice(-MAX_DETAIL),
        ...(item['success'] === false ? { status: 'failed' } : {}),
      };
    case 'subAgentActivity':
      return {
        kind: 'agent',
        status:
          agentStatus(item['kind']) === 'pending' ? 'inProgress' : activityStatus(agentStatus(item['kind'])),
        title: string(item['agentPath']),
        agents: [
          {
            id: string(item['agentThreadId']),
            name: string(item['agentPath']) || string(item['agentThreadId']),
            status: agentStatus(item['kind']),
            result: string(item['message']),
          },
        ],
      };
    case 'webSearch':
      return {
        ...base,
        kind: 'web-search',
        title: string(item['query']),
        detail: JSON.stringify(item['action'] ?? '', null, 2).slice(-MAX_DETAIL),
      };
    case 'imageGeneration':
      return {
        ...base,
        kind: 'image-generation',
        ...(item['failure'] && Object.keys(object(item['failure'])).length ? { status: 'failed' } : {}),
      };
    case 'collabAgentToolCall':
      return {
        ...base,
        kind: 'agent',
        title: string(item['tool']),
        agents: agentStates(item),
        detail: JSON.stringify({ prompt: item['prompt'], agents: item['agentsStates'] }, null, 2).slice(
          -MAX_DETAIL,
        ),
      };
    case 'plan':
      return { ...base, kind: 'plan' };
    case 'contextCompaction':
      return { ...base, kind: 'compaction' };
    case 'enteredReviewMode':
    case 'exitedReviewMode':
      return { ...base, kind: 'review', detail: string(item['review']) };
    default:
      return undefined;
  }
}
