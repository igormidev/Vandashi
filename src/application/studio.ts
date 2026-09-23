import { AppFault } from '../domain/diagnostics';
import type { AgentPort } from '../domain/agent';
import type { MediaPort } from '../domain/media';
import type { AppEvent, Scope, Workspace } from '../domain/models';
import type { GitPort, StoragePort } from '../domain/storage';
import type { OperationGate } from './operation-gate';
import type { Commits } from './commits';

export class Studio {
  private readonly baselines = new Map<string, string>();
  private readonly discards = new Map<string, { baseline: string; backup: string }>();
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
  ) {}
  async start(scope: Scope) {
    return this.gate.run('studio-open', async () => {
      if (!scope.videoId) throw new AppFault({ id: 'appOpenVideo' });
      // Opening storage may repair YAML or synchronize assets, so preflight owns the same lease.
      if ((await this.store.openWorkspace(scope)).video?.origin === 'imported')
        throw new AppFault({ id: 'appImportedNoComposition' });
      const path = await this.store.projectPath(scope);
      if (!(await this.git.status(path)).dirty && !this.discards.has(path))
        this.baselines.set(path, await this.git.head(path));
      else if (!this.baselines.has(path)) throw new AppFault({ id: 'appSaveBeforeStudio' });
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
    return {
      dirty: (await this.git.status(path)).dirty || this.discards.has(path),
      files: await this.pendingChanges(path),
    };
  }
  private async pendingChanges(path: string) {
    const discard = this.discards.get(path);
    const preserved = discard ? await this.git.diffBetween(path, discard.baseline, discard.backup) : [];
    const files = new Map(preserved.map((file) => [file.path, file]));
    for (const file of await this.git.diff(path)) {
      const prior = files.get(file.path);
      files.set(
        file.path,
        prior
          ? {
              ...file,
              additions: prior.additions + file.additions,
              deletions: prior.deletions + file.deletions,
              diff: `${prior.diff}\n${file.diff}`,
            }
          : file,
      );
    }
    return [...files.values()];
  }
  async discard(scope: Scope): Promise<void> {
    await this.gate.run('studio-discard', async () => {
      const path = await this.store.projectPath(scope);
      const sha = this.baselines.get(path);
      await this.flush(path);
      if (!sha) throw new AppFault({ id: 'appStudioCheckpointMissing' });
      let discard = this.discards.get(path);
      if (!discard) {
        if ((await this.git.head(path)) !== sha) throw new AppFault({ id: 'appStudioCheckpointChanged' });
        if ((await this.git.status(path)).dirty) {
          const backup = await this.git.commit(
            path,
            'Preserve discarded Studio edits',
            'Safety snapshot of manual Studio changes before restoring the editor checkpoint.',
            sha,
          );
          discard = { baseline: sha, backup };
          this.discards.set(path, discard);
        }
      }
      if (discard) await this.git.restore(path, discard.baseline, discard.backup);
      this.discards.delete(path);
      this.baselines.delete(path);
      this.emit({ type: 'workspace-changed', scope });
    });
  }
  async save(input: { scope: Scope; title: string; body: string }): Promise<Workspace> {
    return this.gate.run('studio-save', async () => {
      if (!input.title.trim() || !input.body.trim()) throw new AppFault({ id: 'appCommitRequired' });
      const cwd = await this.store.projectPath(input.scope);
      const settings = (await this.store.getState()).settings;
      for (const repository of await this.store.repositories(input.scope))
        if (repository !== cwd && (await this.git.status(repository)).dirty)
          throw new AppFault({ id: 'appStudioOtherChanges' });
      await this.flush(cwd);
      const diff = await this.pendingChanges(cwd);
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

Update ONLY script.md. Describe the meaningful changes at the affected scenes: displayed words, typography, colors, sizes, layout and crop, element layering, entrance/exit motion, transitions, scene duration and timing, audio clips/levels/fades, and asset substitutions as supported by the actual change. Keep the existing narration and untouched scene directions. Retain usable exact timestamps when present. Every referenced image, video, audio or sound effect must use the application's mention syntax @[asset name](<absolute filesystem path>), resolved from the real project/video_assets and shared asset files; the angle brackets preserve paths containing spaces. Do not invent files or references. If a document is initially blank, write a concise scene-by-scene account of the actual composition, rather than inventing a new story.

Pure serialization, editor IDs, cache changes and harmless metadata do not need script prose. If no meaningful description changes, leave the script unchanged. Do not edit, revert, regenerate or render the video, install anything, commit, or modify another file. Vandashi will create the user-approved commit after you finish. Before completing, compare the updated affected script sections against the source and ensure they no longer contradict the user's edits. Briefly report what you synchronized, or why no script change was necessary.

Pending changes (inspect the full files yourself if this excerpt is truncated): ${JSON.stringify(diff).slice(0, 40000)}`,
        },
        () => undefined,
      );
      if (result.status !== 'completed')
        throw new AppFault({ id: 'appScriptSyncFailed' }, result.error ?? undefined);
      await this.media.normalizeProject(cwd);
      // A failed discard already committed its edits for safety. Record the reviewed save even if
      // synchronization correctly leaves the script unchanged; the safety message is not its approval.
      const preservedHead = this.discards.has(cwd) ? await this.git.head(cwd) : undefined;
      await this.git.commit(cwd, input.title, input.body, preservedHead);
      this.discards.delete(cwd);
      this.baselines.delete(cwd);
      this.emit({ type: 'workspace-changed', scope: input.scope });
      return this.store.openWorkspace(input.scope);
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
