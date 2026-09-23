import { AppFault } from '../domain/diagnostics';
import type { AgentPort } from '../domain/agent';
import type { MediaPort } from '../domain/media';
import type { AppEvent, ChatMessage, ChatRequest, ChatSession } from '../domain/models';
import type { GitPort, StoragePort } from '../domain/storage';
import { buildWorkspacePrompt } from '../domain/prompts';
import { clipHandoffText } from '../domain/clip-handoff';
import type { Commits } from './commits';
import type { Prepared, ScriptInput } from './chat-types';
import { prepareAgentScope } from './agent-repositories';
import { publishScope, publishScopeGuidance, publishTarget, verifyPublishMedia } from './publish-scope';

export class ChatPreparation {
  constructor(
    private readonly store: StoragePort,
    private readonly git: GitPort,
    private readonly agent: AgentPort,
    private readonly commits: Commits,
    private readonly notify: (event: AppEvent) => void,
    private readonly media?: MediaPort,
  ) {}
  async prepare(
    session: ChatSession,
    request: ChatRequest,
    state: { filesTouched: boolean },
    script?: ScriptInput,
  ): Promise<Prepared> {
    if (request.handoff) {
      if (session.topic !== 'clip' || !session.scope.videoId || !session.scope.clipId)
        throw new AppFault({ id: 'untrustedRequest' });
      request = { ...request, text: clipHandoffText(request.handoff) };
    }
    const scope = publishTarget(session.scope, session.topic)?.scope ?? session.scope;
    if (request.mode === 'edit' && scope.videoId) await this.media?.stopStudio();
    const files = await prepareAgentScope(this.store, this.git, this.commits, scope, () => {
      state.filesTouched = true;
    });
    const { repositories, sharedScopes, heads, cwd } = files;
    const publication = await publishScope(this.store, session.scope, session.topic);
    if (publication && request.mode === 'edit') await verifyPublishMedia(publication, this.media);
    const capabilities = await this.agent.capabilities(cwd);
    const skill = capabilities.skills.find((entry) => entry.name === 'hyperframes');
    const original = structuredClone(session);
    const scriptHead = heads[cwd];
    if (script && !scriptHead) throw new AppFault({ id: 'appScriptCheckpointMissing' });
    const originalScript = script && scriptHead ? await this.git.readAt(cwd, scriptHead, 'script.md') : null;
    let staged = false;
    const rollback = async () => {
      if (!staged || !script) return;
      const workspace = await this.store.openWorkspace(session.scope);
      const current = workspace.documents.find((document) => document.kind === 'script');
      if (current?.content !== script.content && current?.content !== originalScript)
        throw new AppFault({ id: 'appScriptChangedDuringStart' });
      const head = heads[cwd];
      if (!head) throw new AppFault({ id: 'appScriptCheckpointPreserved' });
      await this.git.restoreFiles(cwd, head, ['script.md']);
    };
    try {
      if (script) {
        staged = true;
        await this.store.writeScript(script);
        await this.git.stage(cwd, ['script.md']);
      }
      const workspace = publication?.workspace ?? (await this.store.openWorkspace(session.scope));
      const prompt =
        (publication ? publishScopeGuidance(publication, repositories) : '') +
        buildWorkspacePrompt({
          workspace,
          topic: session.topic,
          mode: request.mode,
          text: request.text,
          scriptStaged: !!script,
          ...(skill ? { hyperframesSkill: skill } : {}),
        });
      const message: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: request.text,
        ...(script && !script.guidance.trim() ? { appMessage: { id: 'scriptHandoff' as const } } : {}),
        ...(request.handoff
          ? { appMessage: request.handoff.message, userText: request.handoff.guidance }
          : {}),
        turnId: null,
        files: [],
        createdAt: new Date().toISOString(),
      };
      session.messages.push(message);
      session.updatedAt = new Date().toISOString();
      await this.store.saveSession(session);
      this.notify({ type: 'chat', sessionId: session.id, message, delta: false });
      this.notify({ type: 'activity', activity: { sessionId: session.id, phase: 'starting', detail: '' } });
      return {
        session,
        original,
        request,
        scope,
        sharedScopes,
        heads,
        rollback,
        input: {
          threadId: session.threadId,
          cwd,
          mode: request.mode,
          writableRoots: request.mode === 'edit' ? repositories : [],
          selection: request.selection,
          prompt,
          attachments: request.attachments,
        },
      };
    } catch (error) {
      await rollback();
      throw error;
    }
  }
}
