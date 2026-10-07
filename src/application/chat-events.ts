import type { AgentEvent } from '../domain/agent';
import type { AppEvent } from '../domain/models';
import type { ChatInputs, InputOwner } from './chat-input';
import type { Prepared } from './chat-types';

interface ChatEventContext {
  prepared: Prepared;
  lifecycle: { started: boolean };
  inputRun: InputOwner;
  inputs: ChatInputs;
  notify: (event: AppEvent) => void;
  accepted: () => void;
}

/** Apply provider events; transient question state must never enter the durable transcript. */
export function receiveChatEvent(context: ChatEventContext, event: AgentEvent): boolean {
  const { prepared, lifecycle, inputRun, inputs, notify, accepted } = context;
  const { session, original, heads } = prepared;
  if (event.type === 'thread') {
    session.threadId = event.threadId;
    inputRun.threadId = event.threadId;
  }
  if (event.type === 'turn') {
    if (lifecycle.started) return false;
    lifecycle.started = true;
    inputRun.turnId = event.turnId;
    session.checkpoints = [
      ...(session.checkpoints ?? []),
      {
        turnId: event.turnId,
        mode: prepared.request.mode,
        collaboration: prepared.request.collaboration ?? 'default',
        threadId: session.threadId ?? '',
        heads,
        messageCount: original.messages.length,
      },
    ];
    const message = session.messages.at(-1);
    if (message?.role === 'user') message.turnId = event.turnId;
    notify({ type: 'activity', activity: { sessionId: session.id, phase: 'working', detail: '' } });
    accepted();
  }
  if (event.type === 'user-input') {
    inputs.update(inputRun, event.request);
    return false;
  }
  if (event.type === 'message') {
    const index = session.messages.findIndex((message) => message.id === event.message.id);
    if (index < 0) session.messages.push(event.message);
    else session.messages[index] = event.message;
    notify({ type: 'chat', sessionId: session.id, message: event.message, delta: event.delta });
  }
  if (event.type === 'warning')
    notify({
      type: 'notice',
      code: 'agent-warning',
      detail: event.detail,
      ...(event.diagnostic ? { diagnostic: event.diagnostic } : {}),
    });
  return true;
}
