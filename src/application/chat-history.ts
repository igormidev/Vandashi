import { AgentError, type AgentPort, type AgentThread } from '../domain/agent';
import type { AppEvent, ChatMessage, ChatSession, Scope } from '../domain/models';
import type { StoragePort } from '../domain/storage';

/** Recover provider snapshots without dropping application receipts, errors, or stable user IDs. */
export function mergeThreadHistory(session: ChatSession, thread: AgentThread): ChatSession {
  if (thread.id !== session.threadId) throw new Error('Codex returned a different conversation.');
  const messages = session.messages.slice();
  const known = (message: ChatMessage): number => {
    const exact = messages.findIndex((local) => local.id === message.id);
    if (exact >= 0 || message.role !== 'user') return exact;
    const turn = messages.findIndex((local) => local.role === 'user' && local.turnId === message.turnId);
    if (turn >= 0) return turn;
    // Only the last unsatisfied submission can correspond to a turn whose ACK was lost.
    let lastUser = messages.length - 1;
    while (lastUser >= 0 && messages[lastUser]?.role !== 'user') lastUser--;
    const pending = messages[lastUser];
    return pending?.turnId === null && pending.text === message.text ? lastUser : -1;
  };
  const nextAnchors: (string | undefined)[] = [];
  let nextAnchor: string | undefined;
  for (let position = thread.messages.length - 1; position >= 0; position--) {
    nextAnchors[position] = nextAnchor;
    const remote = thread.messages[position];
    const local = remote ? messages[known(remote)] : undefined;
    if (local) nextAnchor = local.id;
  }
  let previous: { id: string; turnId: string | null } | undefined;
  for (let position = 0; position < thread.messages.length; position++) {
    const remote = thread.messages[position];
    if (!remote) continue;
    const index = known(remote);
    const local = messages[index];
    if (local) {
      messages[index] =
        local.role === 'user' || local.appMessage
          ? { ...local, turnId: remote.turnId }
          : {
              ...remote,
              text: remote.text || local.text,
              files: remote.files.length ? remote.files : local.files,
              createdAt: local.createdAt,
            };
      previous = { id: local.id, turnId: remote.turnId };
      continue;
    }
    const previousIndex =
      previous?.turnId === remote.turnId ? messages.findIndex((message) => message.id === previous?.id) : -1;
    const next = messages.findIndex((message) => message.id === nextAnchors[position]);
    messages.splice(previousIndex >= 0 ? previousIndex + 1 : next >= 0 ? next : messages.length, 0, remote);
    previous = { id: remote.id, turnId: remote.turnId };
  }
  const checkpoints = session.checkpoints?.map((checkpoint) => {
    const anchor = session.messages[checkpoint.messageCount];
    const count = anchor ? messages.findIndex((message) => message.id === anchor.id) : -1;
    return count < 0 ? checkpoint : { ...checkpoint, messageCount: count };
  });
  return { ...session, messages, ...(checkpoints ? { checkpoints } : {}) };
}

export async function openChatSession(
  store: StoragePort,
  agent: AgentPort,
  input: { scope: Scope; topic: string; title: string },
  notify: (event: AppEvent) => void,
): Promise<ChatSession> {
  let session: ChatSession = (await store.sessions(input.scope)).find(
    (session) => session.topic === input.topic,
  ) ?? {
    id: crypto.randomUUID(),
    scope: input.scope,
    topic: input.topic,
    title: input.title,
    threadId: null,
    messages: [],
    open: true,
    updatedAt: new Date().toISOString(),
  };
  if (session.threadId) {
    try {
      session = mergeThreadHistory(session, await agent.readThread(session.threadId));
    } catch (error) {
      if (!(error instanceof AgentError) || error.code !== 'missing-history') throw error;
      session.threadId = null;
      notify({
        type: 'notice',
        code: 'missing-history',
        detail: 'The previous Codex conversation could not be found. A new conversation will start.',
      });
    }
  }
  session.open = true;
  session.updatedAt = new Date().toISOString();
  await store.saveSession(session);
  return session;
}
