import { relative, isAbsolute } from 'node:path';
import { StudioRecovery } from './studio-recovery';
import { AppFault } from '../domain/diagnostics';
import type { AgentPort } from '../domain/agent';
import type { MediaPort } from '../domain/media';
import type { AppEvent, Scope, Workspace } from '../domain/models';
import type { GitPort, StoragePort } from '../domain/storage';
import type { OperationGate } from './operation-gate';
import type { Commits } from './commits';
import type { Transcriptions } from './transcriptions';

export class Studio {
  private readonly recovery: StudioRecovery;
  private readonly studioUrls = new Map<string, string>();
  constructor(
    private readonly store: StoragePort,
    private readonly git: GitPort,
    private readonly media: MediaPort,
    private readonly agent: AgentPort,
    private readonly gate: OperationGate,
    private readonly commits: Commits,
    private readonly emit: (event: AppEvent) => void,
    private readonly prepareStudio?: (url: string) => Promise<void>,
    private readonly flushStudio?: (url: string) => Promise<void>,
    private readonly transcriptions?: Transcriptions,
  ) {
    this.recovery = new StudioRecovery(git);
  }
  async start(scope: Scope) {
    return this.gate.runStartup('studio-open', async () => {
      if (!scope.videoId) throw new AppFault({ id: 'appOpenVideo' });
      // Opening storage may repair YAML or synchronize assets, so preflight owns the same lease.
      if ((await this.store.openWorkspace(scope)).video?.origin === 'imported')
        throw new AppFault({ id: 'appImportedNoComposition' });
      const path = await this.store.projectPath(scope);
      await this.recovery.open(path);
      const studio = await this.media.startStudio(path);
      this.studioUrls.set(path, studio.url);
      await this.prepareStudio?.(studio.url);
      return studio;
    });
  }
  private async flush(path: string): Promise<void> {
    const url = this.studioUrls.get(path);
    if (url) await this.flushStudio?.(url);
  }
  async changes(scope: Scope) {
    const path = await this.store.projectPath(scope);
    await this.flush(path);
    return this.recovery.changes(path);
  }
  async discard(scope: Scope): Promise<void> {
    await this.gate.run('studio-discard', async () => {
      const path = await this.store.projectPath(scope);
      await this.flush(path);
      await this.recovery.discard(path);
      this.emit({ type: 'workspace-changed', scope });
    });
  }
  async save(input: { scope: Scope; title: string; body: string }): Promise<Workspace> {
    return this.gate.run('studio-save', async () => {
      if (!input.title.trim() || !input.body.trim()) throw new AppFault({ id: 'appCommitRequired' });
      const cwd = await this.store.projectPath(input.scope);
      const settings = (await this.store.getState()).settings;
      const discovered = await this.store.discoverAgentScope(input.scope);
      const repositories = discovered.repositories.filter((repository) => {
        const path = relative(cwd, repository);
        return !isAbsolute(path) && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\');
      });
      for (const repository of discovered.repositories)
        if (!repositories.includes(repository) && (await this.git.status(repository)).dirty)
          throw new AppFault({ id: 'appStudioOtherChanges' });
      await this.flush(cwd);
      const diff = (await this.recovery.changes(cwd)).files;
      const ready = await this.recovery.prepare(cwd, repositories, input);
      if (ready) {
        await this.recovery.approve(cwd);
        const workspace = await this.store.openWorkspace(input.scope);
        this.recovery.complete(cwd);
        this.emit({ type: 'workspace-changed', scope: input.scope });
        return workspace;
      }
      let failure: { error: unknown } | undefined;
      try {
        const result = await this.agent.run(
          {
            threadId: null,
            cwd,
            mode: 'edit',
            writableRoots: [cwd],
            selection: settings.scriptSync,
            attachments: [],
            prompt: `Synchronize this video's human-readable specification with the user's approved manual Studio edits. Work carefully: script.md is what future AI creation turns read to rebuild or modify the video. Leaving outdated instructions there would undo the user's design choices in a later turn. The current rendered composition and its manual overrides are the source of truth; the script must describe them, not impose its older directions on the video.

Read script.md first to preserve its language, scene identifiers, headings, narrative intent, and unaffected details. Inspect the pending Git diff and the actual relevant source: index.html, referenced scene/composition files, and any .hyperframes/studio-manual-edits.json or .hyperframes/studio-motion.json. Use git show HEAD:path when you need the before-state. A list of changed files alone is not enough. Follow the affected timeline and media references to understand timing and the visual result. Read relevant brand/video guide files when necessary, but do not edit them.

MANDATORY: read adjacent .vandashi.json analysis for referenced audio/video. Describe speech timing from transcription segments/words, converting source timestamps to the composition timeline after trims and speed changes. Music and effects may explicitly omit transcription. Never invent word timing or imply that captions match speech without evidence. ${this.transcriptions?.guidePath ? `The app-owned asset preparation guide is ${JSON.stringify(this.transcriptions.guidePath)}; this script-only task must not add assets or run its mutating command.` : ''}

Update ONLY script.md. Describe the meaningful changes at the affected scenes: displayed words, typography, colors, sizes, layout and crop, element layering, entrance/exit motion, transitions, scene duration and timing, audio clips/levels/fades, and asset substitutions as supported by the actual change. Keep the existing narration and untouched scene directions. Retain usable exact timestamps when present. Every referenced image, video, audio or sound effect must use the application's mention syntax @[asset name](<absolute filesystem path>), resolved from the real project/video_assets and shared asset files; the angle brackets preserve paths containing spaces. Do not invent files or references. If a document is initially blank, write a concise scene-by-scene account of the actual composition, rather than inventing a new story.

Pure serialization, editor IDs, cache changes and harmless metadata do not need script prose. If no meaningful description changes, leave the script unchanged. Do not edit, revert, regenerate or render the video, install anything, commit, or modify another file. Vandashi will create the user-approved commit after you finish. Before completing, compare the updated affected script sections against the source and ensure they no longer contradict the user's edits. Briefly report what you synchronized, or why no script change was necessary.

Pending changes (inspect the full files yourself if this excerpt is truncated): ${JSON.stringify(diff).slice(0, 40000)}`,
          },
          () => undefined,
        );
        if (result.status !== 'completed')
          throw new AppFault({ id: 'appScriptSyncFailed' }, result.error ?? undefined);
      } catch (error) {
        failure = { error };
      }
      try {
        await this.transcriptions?.reconcileRepositories(repositories);
        await this.media.normalizeProject(cwd);
      } catch (error) {
        failure ??= { error };
      }
      if (failure) {
        await this.recovery.preserve(cwd);
        throw failure.error;
      }
      this.recovery.ready(cwd);
      await this.recovery.approve(cwd);
      const workspace = await this.store.openWorkspace(input.scope);
      this.recovery.complete(cwd);
      this.emit({ type: 'workspace-changed', scope: input.scope });
      return workspace;
    });
  }
  async render(scope: Scope): Promise<string> {
    return this.gate.run('render', async () => {
      if ((await this.store.openWorkspace(scope)).video?.origin === 'imported')
        throw new AppFault({ id: 'appFinishedNoRender' });
      for (const repository of await this.store.repositories(scope))
        if ((await this.git.status(repository)).dirty) throw new AppFault({ id: 'appSaveBeforeRender' });
      const project = await this.store.projectPath(scope);
      const source = await this.git.contentRevision(project);
      const path = await this.media.renderVideo(project, (progress, detail, label) => {
        this.emit({ type: 'render', progress, detail, ...(label ? { label } : {}) });
      });
      if ((await this.git.contentRevision(project)) !== source || (await this.git.status(project)).dirty)
        throw new AppFault({ id: 'appRenderSourceChanged' });
      await this.store.setRenderedPath(scope, path);
      await this.commits.reconcile(scope);
      this.emit({ type: 'workspace-changed', scope });
      return path;
    });
  }
}
