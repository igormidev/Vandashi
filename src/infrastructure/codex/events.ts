import type { ChatMessage, FileChange } from '../../domain/models';
import type { AgentEvent } from '../../domain/agent';
import { USER_PROMPT_MARKER } from '../../domain/prompts';
import type { RpcNotification } from './transport';
import { array, itemSchema, object, string, strings } from './schemas';
import type { CodexItem } from './schemas';
import { AppFault } from '../../domain/diagnostics';
import { itemActivity, planSteps } from './activity';

const MAX_TOOL_TEXT = 64 * 1024;
function visibleUserText(item: CodexItem): string {
  const text = array(item['content'])
    .map((part) => string(object(part)['text']))
    .filter(Boolean)
    .join('\n');
  const marker = text.lastIndexOf(USER_PROMPT_MARKER);
  return marker < 0 ? text : text.slice(marker + USER_PROMPT_MARKER.length);
}
function changes(value: unknown): FileChange[] {
  return array(value).map((entry) => {
    const change = object(entry);
    const diff = string(change['diff']);
    const lines = diff.split('\n');
    return {
      path: string(change['path']),
      diff,
      additions: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
      deletions: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length,
    };
  });
}
export function itemMessage(
  item: CodexItem,
  turnId: string,
  createdAt = new Date().toISOString(),
): ChatMessage | null {
  const activity = itemActivity(item);
  const base = {
    id: item.id,
    turnId,
    files: [],
    createdAt,
    streaming: false,
    ...(activity ? { activity } : {}),
  };
  switch (item.type) {
    case 'userMessage':
      return { ...base, role: 'user', text: visibleUserText(item) };
    case 'agentMessage': {
      const phase = item['phase'];
      return {
        ...base,
        role: 'assistant',
        text: string(item['text']),
        ...(phase === 'commentary' || phase === 'final_answer' ? { phase } : {}),
      };
    }
    case 'reasoning':
      return {
        ...base,
        role: 'reasoning',
        text: strings(item['summary']).join('\n\n') || strings(item['content']).join('\n\n'),
      };
    case 'plan':
      return { ...base, role: 'assistant', text: string(item['text']), proposedPlan: true };
    case 'collabAgentToolCall':
    case 'subAgentActivity':
    case 'contextCompaction':
    case 'enteredReviewMode':
    case 'exitedReviewMode':
      return { ...base, role: 'tool', text: activity?.detail ?? '' };
    case 'commandExecution':
      return {
        ...base,
        role: 'tool',
        text: `${string(item['command'])}\n${string(item['aggregatedOutput'])}`.slice(-MAX_TOOL_TEXT),
      };
    case 'fileChange':
      return { ...base, role: 'tool', text: '', files: changes(item['changes']) };
    case 'mcpToolCall':
      return {
        ...base,
        role: 'tool',
        text: `${string(item['server'])}/${string(item['tool'])}\n${JSON.stringify(item['result'] ?? item['error'] ?? '')}`.slice(
          -MAX_TOOL_TEXT,
        ),
      };
    case 'dynamicToolCall':
      return {
        ...base,
        role: 'tool',
        text: `${string(item['tool'])}\n${JSON.stringify(item['contentItems'] ?? '')}`.slice(-MAX_TOOL_TEXT),
      };
    case 'webSearch':
      return { ...base, role: 'tool', text: string(item['query']) };
    case 'imageGeneration': {
      const status = string(item['status']);
      const savedPath = string(item['savedPath']);
      const failure = object(item['failure']);
      const failed = status === 'failed' || Object.keys(failure).length > 0;
      return {
        ...base,
        role: failed ? 'error' : 'tool',
        text: [`image_generation: ${status}`, ...(failed ? [JSON.stringify(failure)] : []), savedPath]
          .filter(Boolean)
          .join('\n'),
        ...(status === 'completed' && !failed && savedPath ? { generatedImages: [savedPath] } : {}),
      };
    }
    default:
      return null;
  }
}
export class EventReducer {
  private readonly messages = new Map<string, ChatMessage>();
  private readonly phases = new Map<string, string>();
  private readonly summaries = new Map<string, Map<number, string>>();
  private readonly reasoningContent = new Map<string, Map<number, string>>();
  reduce(event: RpcNotification): AgentEvent | null {
    const data = object(event.params);
    const turnId = string(data['turnId']);
    const itemId = string(data['itemId']);
    if (event.method === 'item/started' || event.method === 'item/completed') {
      const item = itemSchema.safeParse(data['item']);
      if (!item.success) return null;
      if (item.data.type === 'agentMessage' && string(item.data['phase']))
        this.phases.set(item.data.id, string(item.data['phase']));
      const previous = this.messages.get(item.data.id);
      const message = itemMessage(item.data, turnId, previous?.createdAt);
      if (!message) return null;
      const started = event.method === 'item/started';
      message.streaming = started;
      if (!message.phase && previous?.phase) message.phase = previous.phase;
      if (!started && !message.text && previous?.text) message.text = previous.text;
      if (message.activity)
        message.activity = {
          ...message.activity,
          ...(started
            ? { status: 'inProgress', startedAt: previous?.activity?.startedAt ?? message.createdAt }
            : {
                ...(previous?.activity?.startedAt ? { startedAt: previous.activity.startedAt } : {}),
                completedAt: new Date().toISOString(),
              }),
        };
      this.messages.set(message.id, message);
      return { type: 'message', message, delta: false };
    }
    if (event.method === 'item/reasoning/summaryTextDelta' || event.method === 'item/reasoning/textDelta') {
      const summary = event.method === 'item/reasoning/summaryTextDelta';
      const rawIndex = data[summary ? 'summaryIndex' : 'contentIndex'];
      const index = typeof rawIndex === 'number' ? rawIndex : 0;
      const collection = summary ? this.summaries : this.reasoningContent;
      const parts = collection.get(itemId) ?? new Map<number, string>();
      parts.set(index, (parts.get(index) ?? '') + string(data['delta']));
      collection.set(itemId, parts);
      // Codex emits both lanes: available summaries take precedence over raw reasoning.
      const visible = this.summaries.get(itemId) ?? parts;
      return this.update(
        itemId,
        turnId,
        'reasoning',
        [...visible]
          .sort((a, b) => a[0] - b[0])
          .map((part) => part[1])
          .join('\n\n'),
        false,
      );
    }
    if (event.method === 'item/agentMessage/delta')
      return this.update(itemId, turnId, 'assistant', string(data['delta']), true);
    if (event.method === 'item/plan/delta') {
      const event = this.update(itemId, turnId, 'assistant', string(data['delta']), true);
      if (event.type === 'message') event.message.proposedPlan = true;
      return event;
    }
    if (event.method === 'item/commandExecution/outputDelta')
      return this.update(itemId, turnId, 'tool', string(data['delta']), true);
    if (event.method === 'turn/plan/updated') {
      const id = `plan:${turnId}`;
      const previous = this.messages.get(id);
      const steps = planSteps(data['plan']);
      const message: ChatMessage = {
        id,
        turnId,
        role: 'tool',
        text: string(data['explanation']),
        files: [],
        createdAt: previous?.createdAt ?? new Date().toISOString(),
        activity: {
          kind: 'plan',
          status: steps.some((step) => step.status !== 'completed') ? 'inProgress' : 'completed',
          steps,
        },
      };
      this.messages.set(id, message);
      return { type: 'message', message, delta: false };
    }
    if (event.method === 'warning' || event.method === 'configWarning')
      return { type: 'warning', detail: string(data['message']) || string(data['summary']) };
    if (event.method === 'vandashi/request-declined') {
      const fault = new AppFault({ id: 'codexRequestWithheld', params: { method: string(data['method']) } });
      return {
        type: 'warning',
        detail: fault.message,
        diagnostic: fault.diagnostic,
      };
    }
    return null;
  }
  output(): string {
    const assistant = [...this.messages.values()].filter((message) => message.role === 'assistant');
    const final = assistant.filter((message) => this.phases.get(message.id) === 'final_answer');
    return (
      final.length ? final : assistant.filter((message) => this.phases.get(message.id) !== 'commentary')
    )
      .map((message) => message.text)
      .join('\n\n');
  }
  settle(turnId: string, status: 'completed' | 'failed' | 'interrupted'): AgentEvent[] {
    const events: AgentEvent[] = [];
    for (const previous of this.messages.values()) {
      if (previous.turnId !== turnId || (!previous.streaming && previous.activity?.status !== 'inProgress'))
        continue;
      const message: ChatMessage = {
        ...previous,
        streaming: false,
        ...(previous.activity?.status === 'inProgress'
          ? { activity: { ...previous.activity, status, completedAt: new Date().toISOString() } }
          : {}),
      };
      this.messages.set(message.id, message);
      events.push({ type: 'message', message, delta: false });
    }
    return events;
  }
  private update(
    id: string,
    turnId: string,
    role: ChatMessage['role'],
    text: string,
    append: boolean,
  ): AgentEvent {
    const previous = this.messages.get(id);
    let combined = append ? (previous?.text ?? '') + text : text;
    if (role === 'tool') combined = combined.slice(-MAX_TOOL_TEXT);
    const message: ChatMessage = {
      ...previous,
      id,
      turnId,
      role,
      text: combined,
      files: previous?.files ?? [],
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      streaming: true,
      ...(previous?.activity && role === 'tool'
        ? {
            activity: {
              ...previous.activity,
              detail: ((previous.activity.detail ?? '') + text).slice(-MAX_TOOL_TEXT),
            },
          }
        : {}),
    };
    this.messages.set(id, message);
    return { type: 'message', message, delta: false };
  }
}
