import { AppFault } from '../domain/diagnostics';
import { parseAgentJson } from './agent-json';
import type { MediaPort } from '../domain/media';
import type { AgentPort } from '../domain/agent';
import type { GitPort, StoragePort } from '../domain/storage';
import type { Scope } from '../domain/models';

export class Commits {
  constructor(
    private readonly store: StoragePort,
    private readonly git: GitPort,
    private readonly agent: AgentPort,
    private readonly media?: MediaPort,
  ) {}
  private async sync(scopes: Scope[]): Promise<{ error: unknown } | undefined> {
    let failure: { error: unknown } | undefined;
    for (const scope of scopes) {
      try {
        await this.store.syncSharedAssets(scope);
      } catch (error) {
        failure ??= { error };
      }
    }
    return failure;
  }
  private async save(repositories: string[], message: { title: string; body: string }): Promise<void> {
    for (const repository of repositories) {
      if ((await this.git.status(repository)).dirty)
        await this.git.commit(repository, message.title, message.body);
      if ((await this.git.status(repository)).dirty)
        throw new AppFault({ id: 'appRepositorySaveFailed', params: { repository } });
    }
  }
  /** Only after clean preflight; housekeeping must not start a hidden model turn before acceptance. */
  async syncBaseline(repositories: string[], scopes: Scope[]): Promise<void> {
    const failure = await this.sync(scopes);
    await this.save(repositories, {
      title: 'Prepare workspace asset metadata',
      body: 'Preserve transcription evidence and synchronize current shared assets in participating video and clip repositories before capturing an AI checkpoint.',
    });
    if (failure) throw failure.error;
  }
  async suggest(
    scope: Scope,
    summary = '',
    repositories?: string[],
  ): Promise<{ title: string; body: string }> {
    const cwd = await this.store.projectPath(scope);
    const state = await this.store.getState();
    const diffs = await Promise.all(
      (repositories ?? (await this.store.repositories(scope))).map(async (repo) => ({
        repo,
        files: await this.git.diff(repo),
      })),
    );
    const result = await this.agent.run(
      {
        threadId: null,
        cwd,
        mode: 'read',
        writableRoots: [],
        selection: state.settings.automation,
        attachments: [],
        prompt: `Write a concise Git commit title and a useful description for these changes. Do not modify any files. The pending manual edit, when present, describes the result that will be saved after the user reviews this message. Compare its before and after values; describe only actual differences, never unchanged context or documents as newly added. Do not mention that the edit is pending or that there are no on-disk changes yet. For an image selection, describe replacing the brand image without claiming its visual contents unless provided. Return JSON only with nonempty title and body.\nPending manual edit:\n${summary}\nExisting on-disk changes:\n${JSON.stringify(diffs).slice(0, 30000)}`,
        outputSchema: {
          type: 'object',
          properties: { title: { type: 'string' }, body: { type: 'string' } },
          required: ['title', 'body'],
          additionalProperties: false,
        },
      },
      () => undefined,
    );
    if (result.status !== 'completed')
      throw new AppFault({ id: 'appCommitGenerationFailed' }, result.error ?? undefined);
    const parsed: unknown = parseAgentJson(result.output);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('title' in parsed) ||
      !('body' in parsed) ||
      typeof parsed.title !== 'string' ||
      typeof parsed.body !== 'string' ||
      !parsed.title.trim() ||
      !parsed.body.trim()
    )
      throw new AppFault({ id: 'appCommitEmpty' });
    return { title: parsed.title.trim(), body: parsed.body.trim() };
  }
  async reconcile(
    scope: Scope,
    normalize = true,
    participatingRepositories?: string[],
    sharedScopes: Scope[] = [],
    prepareMetadata?: () => Promise<void>,
  ): Promise<void> {
    let metadataFailure: { error: unknown } | undefined;
    try {
      await prepareMetadata?.();
    } catch (error) {
      metadataFailure = { error };
    }
    const syncFailure = await this.sync(sharedScopes);
    let normalizationError: Error | undefined;
    try {
      if (normalize && scope.videoId) await this.media?.normalizeProject(await this.store.projectPath(scope));
    } catch (error) {
      normalizationError =
        error instanceof Error
          ? error
          : new AppFault({ id: 'appCompositionIdsFailed' }, typeof error === 'string' ? error : undefined);
    }
    const repositories = participatingRepositories ?? (await this.store.repositories(scope));
    const pending: string[] = [];
    for (const repository of repositories)
      if ((await this.git.status(repository)).dirty) pending.push(repository);
    if (!pending.length) {
      if (metadataFailure) throw metadataFailure.error;
      if (syncFailure) throw syncFailure.error;
      if (normalizationError) throw normalizationError;
      return;
    }
    let message: { title: string; body: string };
    try {
      message = await this.suggest(scope, '', repositories);
    } catch {
      const files = await Promise.all(
        pending.map(
          async (repository) => `${repository}: ${(await this.git.status(repository)).paths.join(', ')}`,
        ),
      );
      message = {
        title: 'Save workspace changes',
        body: `Preserve pending local changes after an edit or interrupted operation. Automatic message generation was unavailable.\n\n${files.join('\n')}`,
      };
    }
    await this.save(repositories, message);
    if (metadataFailure) throw metadataFailure.error;
    if (syncFailure) throw syncFailure.error;
    if (normalizationError) throw new AppFault({ id: 'appNormalizationFailed' }, normalizationError.message);
  }
}
