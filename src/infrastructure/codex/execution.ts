import type { AgentEvent, AgentRunInput, AgentRunResult } from '../../domain/agent';
import { AgentError } from '../../domain/agent';
import { EventReducer } from './events';
import { object, string, turnResponse, turnSchema } from './schemas';
import type { RpcClient } from './transport';

export function sandboxPolicy(input: Pick<AgentRunInput, 'mode' | 'writableRoots'>): Record<string, unknown> {
  return input.mode === 'read'
    ? { type: 'readOnly', networkAccess: true }
    : {
        type: 'workspaceWrite',
        writableRoots: input.writableRoots,
        networkAccess: true,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };
}
export function turnInput(input: AgentRunInput, supportsImages: boolean): Record<string, unknown>[] {
  const attached = input.attachments.length
    ? `\n\nAttached local files (use their absolute paths):\n${input.attachments.map((path) => JSON.stringify(path)).join('\n')}`
    : '';
  const entries: Record<string, unknown>[] = [
    { type: 'text', text: input.prompt + attached, text_elements: [] },
  ];
  if (supportsImages)
    for (const path of input.attachments)
      if (/\.(png|jpe?g|webp|gif)$/i.test(path)) entries.push({ type: 'localImage', path });
  return entries;
}
interface TurnCallbacks {
  onEvent: (event: AgentEvent) => void;
  onTurn: (turnId: string) => void;
  supportsImages: boolean;
  inactivityMs?: number;
}
export async function executeTurn(
  client: RpcClient,
  threadId: string,
  input: AgentRunInput,
  callbacks: TurnCallbacks,
): Promise<AgentRunResult> {
  const reducer = new EventReducer();
  let complete: ((result: AgentRunResult) => void) | undefined;
  let reject: ((error: Error) => void) | undefined;
  let currentTurnId: string | null = null;
  const finished = new Map<string, AgentRunResult>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const completion = new Promise<AgentRunResult>((resolve, fail) => {
    complete = resolve;
    reject = fail;
  });
  // Register a rejection observer before starting RPC, which may itself fail first.
  void completion.catch(() => undefined);
  const resetTimer = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      reject?.(new AgentError('timeout', 'Codex stopped reporting progress.'));
      client.close();
    }, callbacks.inactivityMs ?? 600_000);
  };
  resetTimer();
  const unsubscribe = client.subscribe((event) => {
    const data = object(event.params);
    if (typeof data['threadId'] === 'string' && data['threadId'] !== threadId) return;
    resetTimer();
    if (event.method === 'turn/completed') {
      const parsed = turnSchema.safeParse(data['turn']);
      if (!parsed.success) return;
      const turn = parsed.data;
      for (const item of turn.items) {
        const normalized = reducer.reduce({
          method: 'item/completed',
          params: { threadId, turnId: turn.id, item },
        });
        if (normalized && !(normalized.type === 'message' && normalized.message.role === 'user'))
          callbacks.onEvent(normalized);
      }
      const status = turn.status === 'completed' || turn.status === 'interrupted' ? turn.status : 'failed';
      const result: AgentRunResult = {
        threadId,
        turnId: turn.id,
        status,
        output: reducer.output(),
        error: turn.error?.message ?? null,
      };
      finished.set(turn.id, result);
      if (currentTurnId === turn.id) complete?.(result);
      return;
    }
    if (event.method === 'error' && data['willRetry'] !== true) {
      callbacks.onEvent({
        type: 'warning',
        detail: string(object(data['error'])['message']) || string(data['message']),
      });
    }
    const normalized = reducer.reduce(event);
    if (normalized && !(normalized.type === 'message' && normalized.message.role === 'user'))
      callbacks.onEvent(normalized);
  });
  const failure = client.onFailure((error) => reject?.(error));
  try {
    const response = turnResponse.parse(
      await client.request('turn/start', {
        threadId,
        input: turnInput(input, callbacks.supportsImages),
        cwd: input.cwd,
        runtimeWorkspaceRoots: input.writableRoots.length ? input.writableRoots : [input.cwd],
        model: input.selection.model,
        effort: input.selection.reasoning,
        serviceTier: input.selection.fast ? 'priority' : null,
        approvalPolicy: 'never',
        sandboxPolicy: sandboxPolicy(input),
        ...(input.outputSchema ? { outputSchema: input.outputSchema } : {}),
      }),
    );
    currentTurnId = response.turn.id;
    callbacks.onTurn(currentTurnId);
    callbacks.onEvent({ type: 'turn', turnId: currentTurnId });
    const earlyResult = finished.get(currentTurnId);
    if (earlyResult) complete?.(earlyResult);
    return await completion;
  } finally {
    clearTimeout(timer);
    unsubscribe();
    failure();
  }
}
