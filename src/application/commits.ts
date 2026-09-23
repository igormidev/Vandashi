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
  async suggest(scope: Scope, summary = ''): Promise<{ title: string; body: string }> {
    const cwd = await this.store.projectPath(scope);
    const state = await this.store.getState();
    const diffs = await Promise.all(
      (await this.store.repositories(scope)).map(async (repo) => ({
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
        prompt: `Write a concise Git commit title and a useful description for these changes. Do not modify any files. If there are no on-disk changes yet, describe the user's pending manual workspace edit. Return JSON only with nonempty title and body.\n${summary}\n${JSON.stringify(diffs).slice(0, 30000)}`,
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
  async reconcile(scope: Scope, normalize = true): Promise<void> {
    let normalizationError: Error | undefined;
    try {
      if (normalize && scope.videoId) await this.media?.normalizeProject(await this.store.projectPath(scope));
    } catch (error) {
      normalizationError =
        error instanceof Error
          ? error
          : new AppFault({ id: 'appCompositionIdsFailed' }, typeof error === 'string' ? error : undefined);
    }
    const repositories = await this.store.repositories(scope);
    const pending: string[] = [];
    for (const repository of repositories)
      if ((await this.git.status(repository)).dirty) pending.push(repository);
    if (!pending.length) {
      if (normalizationError) throw normalizationError;
      return;
    }
    let message: { title: string; body: string };
    try {
      message = await this.suggest(scope);
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
    for (const repository of repositories) {
      if ((await this.git.status(repository)).dirty)
        await this.git.commit(repository, message.title, message.body);
      if ((await this.git.status(repository)).dirty)
        throw new AppFault({ id: 'appRepositorySaveFailed', params: { repository } });
    }
    if (normalizationError) throw new AppFault({ id: 'appNormalizationFailed' }, normalizationError.message);
  }
}
