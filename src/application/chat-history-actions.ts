import { AppFault } from '../domain/diagnostics';
import type { AgentPort } from '../domain/agent';
import type { ChatMessageTarget, RewoundChat } from '../domain/chat-history-actions';
import type { AppEvent, ChatSession } from '../domain/models';
import type { GitPort, StoragePort } from '../domain/storage';
import { mergeThreadHistory } from './chat-history';
import { undoChat } from './chat-undo';
import { clipHandoffText, parseClipHandoff } from '../domain/clip-handoff';

export async function rewindMessage(
  store: StoragePort,
  git: GitPort,
  agent: AgentPort,
  target: ChatMessageTarget,
  notify: (event: AppEvent) => void,
): Promise<RewoundChat> {
  const current = await store.getSession(target.sessionId);
  const message = current.messages.find((entry) => entry.id === target.messageId);
  if (!message || message.role !== 'user' || !message.turnId || message.pending)
    throw new AppFault({ id: 'untrustedRequest' });
  const checkpoint = current.checkpoints?.find((entry) => entry.turnId === message.turnId);
  if (!checkpoint || current.messages[checkpoint.messageCount]?.id !== message.id)
    throw new AppFault({ id: 'appUndoUnverified' });
  const handoff =
    message.appMessage?.id === 'clipHandoff'
      ? parseClipHandoff({ message: message.appMessage, guidance: message.userText ?? '' })
      : undefined;
  if (message.appMessage?.id === 'clipHandoff' && !handoff) throw new AppFault({ id: 'untrustedRequest' });
  const session = await undoChat(store, git, agent, current.id, notify, message.turnId);
  return {
    session,
    draft: {
      text: handoff ? clipHandoffText(handoff) : (message.userText ?? message.text),
      mode: checkpoint.mode ?? 'edit',
      collaboration: checkpoint.collaboration ?? 'default',
      attachments: message.attachments?.slice() ?? [],
      ...(handoff ? { handoff } : {}),
    },
  };
}

/** A conversation branch shares the current workspace and starts with no old Git undo rights. */
export async function forkMessage(
  store: StoragePort,
  agent: AgentPort,
  target: ChatMessageTarget,
): Promise<ChatSession> {
  const current = await store.getSession(target.sessionId);
  const index = current.messages.findIndex((entry) => entry.id === target.messageId);
  const message = current.messages[index];
  if (
    !current.threadId ||
    !message ||
    message.role !== 'assistant' ||
    !message.turnId ||
    message.pending ||
    message.streaming === true ||
    !agent.forkThrough
  )
    throw new AppFault({ id: 'untrustedRequest' });
  const provider = await agent.forkThrough(current.threadId, message.turnId);
  const nextUser = current.messages.findIndex(
    (entry, position) => position > index && entry.role === 'user' && entry.turnId !== message.turnId,
  );
  const fork = mergeThreadHistory(
    {
      ...current,
      id: crypto.randomUUID(),
      threadId: provider.id,
      messages: current.messages.slice(0, nextUser < 0 ? undefined : nextUser),
      checkpoints: [],
      open: true,
      branch: { parentId: current.id, messageId: message.id },
      updatedAt: new Date().toISOString(),
    },
    provider,
  );
  await store.saveSession(fork);
  return fork;
}
