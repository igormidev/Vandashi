import { AppFault } from '../domain/diagnostics';
import type { AgentPort } from '../domain/agent';
import type { StoragePort } from '../domain/storage';
import type { AppEvent, ChatRequest, ChatSession, ChatMessage } from '../domain/models';
import { setupPrompt, setupTarget } from '../domain/setup';
import { agentReadinessFault } from './agent-readiness';
import type { Prepared } from './chat-types';
import type { MediaPort } from '../domain/media';

export async function prepareSetupChat(
  store: StoragePort,
  agent: AgentPort,
  session: ChatSession,
  request: ChatRequest,
  notify: (event: AppEvent) => void,
  media?: MediaPort,
): Promise<Prepared> {
  if (!setupTarget(session.topic) || request.handoff) throw new AppFault({ id: 'untrustedRequest' });
  const fault = agentReadinessFault(await agent.connect());
  if (fault) throw fault;
  const cwd = await store.setupWorkspace();
  const original = structuredClone(session);
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    text: request.text,
    turnId: null,
    files: [],
    createdAt: new Date().toISOString(),
  };
  session.messages.push(message);
  session.updatedAt = new Date().toISOString();
  await store.saveSession(session);
  notify({ type: 'chat', sessionId: session.id, message, delta: false });
  notify({ type: 'activity', activity: { sessionId: session.id, phase: 'starting', detail: '' } });
  return {
    session,
    original,
    request,
    scope: session.scope,
    sharedScopes: [],
    heads: {},
    rollback: () => Promise.resolve(),
    input: {
      threadId: session.threadId,
      cwd,
      mode: request.mode,
      collaboration: request.collaboration ?? 'default',
      purpose: 'host-setup',
      writableRoots: [],
      selection: request.selection,
      prompt: setupPrompt(session.topic, request.text, request.mode) + (media?.setupContext?.() ?? ''),
      attachments: request.attachments,
    },
  };
}
