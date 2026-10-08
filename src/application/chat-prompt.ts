import { AppFault } from '../domain/diagnostics';
import { scopeKey } from '../domain/defaults';
import type { ChatSession } from '../domain/models';
import type { AgentSkill, AgentPort } from '../domain/agent';
import type { StoragePort } from '../domain/storage';
import type { MediaPort } from '../domain/media';
import type { Workspace } from '../domain/models';
import type {
  ChatPromptInspection,
  ChatPromptRequest,
  PromptDocument,
  PromptFilesPort,
  PromptInspectionOwner,
} from '../domain/chat-prompt';
import { promptPathTokens } from '../domain/prompt-references';
import { buildWorkspaceGuidance } from '../domain/system-prompts/workspace';
import { setupGuidance, setupTarget } from '../domain/system-prompts/setup';
import {
  setupDeveloperInstructions,
  workspaceDeveloperInstructions,
} from '../domain/system-prompts/provider';
import { publishScopeGuidance, publishTarget } from './publish-scope';

interface Inspection extends PromptInspectionOwner {
  created: number;
  cwd: string;
  threadId: string | null;
  roots: string[];
  exact: string[];
  references: Map<string, string>;
  documents: Map<string, PromptDocument>;
  bytes: number;
}

/** Session-bound audit reads; no workspace hydration, staging, synchronization or provider turn. */
export class ChatPrompts {
  private inspections = new Map<string, Inspection>();
  constructor(
    private readonly store: StoragePort,
    private readonly agent: AgentPort,
    private readonly files: PromptFilesPort | undefined,
    private readonly workspace: (scope: PromptInspectionOwner['scope']) => Workspace | undefined,
    private readonly media: MediaPort,
    private readonly transcriptionGuidePath?: string,
  ) {}

  async inspect(request: ChatPromptRequest): Promise<ChatPromptInspection> {
    const session = await this.store.getSession(request.sessionId);
    if (!session.open || (request.collaboration === 'plan' && request.mode !== 'read'))
      throw new AppFault({ id: 'untrustedRequest' });
    const setup = setupTarget(session.topic);
    const target = setup ? null : publishTarget(session.scope, session.topic);
    const discovered = setup ? null : await this.store.discoverAgentScope(target?.scope ?? session.scope);
    const cwd =
      (session.topic === 'presets' || session.topic.startsWith('preset:')
        ? discovered?.repositories.find((path) => /[/\\]edition_presets$/u.test(path))
        : undefined) ??
      discovered?.cwd ??
      '';
    const capabilities = setup ? { skills: [], available: true } : await this.capabilities(cwd);
    const hyperframesSkill = capabilities.skills.find((entry) => entry.name === 'hyperframes');
    let guidance: string;
    if (setup) guidance = setupGuidance(session.topic, request.mode) + (this.media.setupContext?.() ?? '');
    else {
      // Only a native-owned, already adopted snapshot is used. Auditing must never repair YAML.
      const workspace = this.workspace(session.scope);
      if (!workspace) throw new AppFault({ id: 'appPromptWorkspaceUnavailable' });
      const publicationTarget = target?.scope.clipId
        ? (this.workspace(target.scope) ??
          (() => {
            const clip = workspace.clips.find((entry) => entry.id === target.scope.clipId);
            if (!clip) throw new AppFault({ id: 'appPublishClipMissing' });
            return { ...workspace, scope: target.scope, video: clip };
          })())
        : workspace;
      const prefix = target
        ? publishScopeGuidance(
            {
              scope: target.scope,
              workspace,
              target: publicationTarget,
              platform: target.platform,
              clipId: target.scope.clipId,
            },
            discovered?.repositories ?? [],
          )
        : '';
      guidance =
        prefix +
        buildWorkspaceGuidance({
          workspace,
          topic: session.topic,
          mode: request.mode,
          text: '',
          ...(!target && request.mode === 'edit' ? { generationStage: '<allocated when sending>' } : {}),
          assetSkills: capabilities.skills.filter((entry) =>
            ['vandashi-create-assets', 'vandashi-use-assets', 'vandashi-create-presets'].includes(entry.name),
          ),
          ...(hyperframesSkill ? { hyperframesSkill } : {}),
          ...(this.transcriptionGuidePath ? { transcriptionGuidePath: this.transcriptionGuidePath } : {}),
        });
    }
    const inspection: Inspection = {
      sessionId: session.id,
      scope: structuredClone(session.scope),
      topic: session.topic,
      created: Date.now(),
      cwd,
      threadId: session.threadId,
      roots: [...(discovered?.repositories ?? []), ...this.skillRoots(capabilities.skills)],
      exact: [
        ...capabilities.skills.map((entry) => entry.path),
        ...(this.transcriptionGuidePath ? [this.transcriptionGuidePath] : []),
      ],
      references: new Map(),
      documents: new Map(),
      bytes: 0,
    };
    const id = crypto.randomUUID();
    const preview = this.document(inspection, guidance, session.topic);
    const developerTemplate = this.document(
      inspection,
      setup ? setupDeveloperInstructions : workspaceDeveloperInstructions,
      session.topic,
    );
    const snapshots = session.messages
      .filter((message) => message.role === 'user' && message.appPrompt)
      .map((message) => ({
        messageId: message.id,
        createdAt: message.createdAt,
        hasDeveloper: Boolean(message.appPrompt?.developerInstructions),
      }));
    // A scope change while discovery was in flight cannot mint an inspection for the old chat.
    await this.owner(inspection);
    for (const [key, value] of this.inspections)
      if (Date.now() - value.created > 15 * 60_000 || value.sessionId === session.id)
        this.inspections.delete(key);
    while (this.inspections.size >= 8) {
      const oldest = this.inspections.keys().next().value;
      if (!oldest) break;
      this.inspections.delete(oldest);
    }
    this.inspections.set(id, inspection);
    return {
      id,
      preview,
      developerTemplate,
      snapshots,
      mode: request.mode,
      collaboration: request.collaboration,
      skillsAvailable: capabilities.available,
      hasLegacyMessages: session.messages.some((message) => message.role === 'user' && !message.appPrompt),
    };
  }

  async source(input: {
    inspectionId: string;
    messageId: string;
    developer: boolean;
  }): Promise<PromptDocument> {
    const inspection = this.inspections.get(input.inspectionId);
    if (!inspection) throw new AppFault({ id: 'untrustedRequest' });
    await this.owner(inspection);
    const session = await this.store.getSession(inspection.sessionId);
    this.assertOwner(inspection, session);
    const message = session.messages.find((entry) => entry.id === input.messageId && entry.role === 'user');
    const text = input.developer ? message?.appPrompt?.developerInstructions : message?.appPrompt?.guidance;
    if (!text) throw new AppFault({ id: 'untrustedRequest' });
    inspection.created = Date.now();
    return this.document(inspection, text, inspection.topic);
  }

  async read(input: { inspectionId: string; referenceId: string }): Promise<PromptDocument> {
    const inspection = this.inspections.get(input.inspectionId);
    const path = inspection?.references.get(input.referenceId);
    if (!inspection || !path || !this.files) throw new AppFault({ id: 'untrustedRequest' });
    await this.owner(inspection);
    const scope = publishTarget(inspection.scope, inspection.topic)?.scope ?? inspection.scope;
    const discovered = setupTarget(inspection.topic) ? null : await this.store.discoverAgentScope(scope);
    // Skill authorization is renewed for each read, never inferred from a saved prompt or renderer path.
    const cwd =
      (inspection.topic === 'presets' || inspection.topic.startsWith('preset:')
        ? discovered?.repositories.find((path) => /[/\\]edition_presets$/u.test(path))
        : undefined) ?? discovered?.cwd;
    const capabilities = cwd ? await this.capabilities(cwd) : { skills: [] };
    const exact = [
      ...capabilities.skills.map((skill) => skill.path),
      ...(this.transcriptionGuidePath ? [this.transcriptionGuidePath] : []),
    ];
    const roots = [...(discovered?.repositories ?? []), ...this.skillRoots(capabilities.skills)];
    const text = await this.files.read(path, roots, exact);
    await this.owner(inspection);
    inspection.roots = roots;
    inspection.exact = exact;
    const document = this.document(inspection, text, path.split(/[/\\]/u).at(-1) ?? path, path);
    inspection.created = Date.now();
    return document;
  }

  private async owner(inspection: Inspection): Promise<void> {
    const session = await this.store.getSession(inspection.sessionId);
    this.assertOwner(inspection, session);
  }

  private assertOwner(inspection: Inspection, session: ChatSession): void {
    if (
      !session.open ||
      scopeKey(session.scope) !== scopeKey(inspection.scope) ||
      session.topic !== inspection.topic ||
      session.threadId !== inspection.threadId
    )
      throw new AppFault({ id: 'untrustedRequest' });
  }

  private async capabilities(cwd: string): Promise<{ skills: AgentSkill[]; available: boolean }> {
    try {
      return { skills: (await this.agent.capabilities(cwd)).skills, available: true };
    } catch {
      return { skills: [], available: false };
    }
  }

  private skillRoots(skills: AgentSkill[]): string[] {
    const files = this.files;
    if (!files) return [];
    return skills.flatMap((skill) => {
      const directory = files.directory(skill.path);
      // The enabled skill's own named folder only, never its parent or the provider home.
      return skill.path.split(/[/\\]/u).at(-1)?.toLowerCase() === 'skill.md' &&
        directory.split(/[/\\]/u).at(-1) === skill.name
        ? [directory]
        : [];
    });
  }

  private document(inspection: Inspection, text: string, title: string, path?: string): PromptDocument {
    const key = path ?? text;
    const cached = inspection.documents.get(key);
    if (cached?.text === text) return cached;
    if (text.length > 2_000_000 || inspection.bytes + text.length > 8_000_000)
      throw new AppFault({ id: 'desktopRequestTooLarge' });
    inspection.bytes += text.length;
    const document: PromptDocument = {
      id: crypto.randomUUID(),
      title,
      ...(path ? { path } : {}),
      text,
      references: [],
    };
    const directory = path && this.files ? this.files.directory(path) : inspection.cwd;
    const tokens = promptPathTokens(text);
    const absolute = tokens.filter((entry) => /^(?:\/|[A-Za-z]:[/\\])/u.test(entry.value));
    for (const token of tokens.slice(0, 1000)) {
      const aliases =
        !path && !/[/\\]/u.test(token.value)
          ? absolute.filter((entry) => entry.value.split(/[/\\]/u).at(-1) === token.value)
          : [];
      const resolved = this.files?.resolve(
        aliases.length === 1 ? (aliases[0]?.value ?? token.value) : token.value,
        directory,
      );
      const referenceId = crypto.randomUUID();
      const readable = Boolean(
        resolved &&
        this.files?.readable(resolved) &&
        this.files.authorized(resolved, inspection.roots, inspection.exact),
      );
      const kind = /\.(?:md|markdown)$/iu.test(token.value)
        ? 'guide'
        : /\.(?:ya?ml|json|toml)$/iu.test(token.value)
          ? 'config'
          : /\.[a-z\d]+$/iu.test(token.value)
            ? 'file'
            : 'directory';
      document.references.push({
        id: referenceId,
        start: token.start,
        end: token.end,
        label: token.value,
        readable,
        kind,
      });
      if (resolved && readable) inspection.references.set(referenceId, resolved);
    }
    inspection.documents.set(key, document);
    return document;
  }
}
