import type { AgentPort } from '../domain/agent';
import type { MediaPort } from '../domain/media';
import type { AppEvent, DependencyCheck, Scope } from '../domain/models';
import type { StoragePort } from '../domain/storage';
import type { Commits } from './commits';

export class Dependencies {
  constructor(
    private readonly store: StoragePort,
    private readonly agent: AgentPort,
    private readonly media: MediaPort,
    private readonly commits: Commits,
    private readonly emit: (event: AppEvent) => void,
  ) {}

  async check(scope: Scope | null, video: boolean): Promise<DependencyCheck[]> {
    const checks: DependencyCheck[] = [];
    const total = 1 + (scope ? 1 : 0) + (video ? 6 : 0);
    const update = (current: string, complete = false) => {
      this.emit({
        type: 'checks',
        scope,
        video,
        checks: [...checks],
        progress: complete ? 1 : Math.min(checks.length / total, 0.95),
        current,
      });
    };
    update('Codex');
    try {
      const status = await this.agent.connect();
      checks.push({
        id: 'Codex',
        status: status.authenticated && status.usageAllowed !== false ? 'ready' : 'missing',
        detail: status.authenticated
          ? status.usageAllowed === false
            ? 'Your usage allowance is currently exhausted.'
            : status.version
          : 'Sign in with codex login.',
        repairPrompt: null,
        helpUrl: 'https://developers.openai.com/codex/cli/',
      });
    } catch (error) {
      checks.push({
        id: 'Codex',
        status: 'missing',
        detail: String(error),
        repairPrompt: null,
        helpUrl: 'https://developers.openai.com/codex/cli/',
      });
    }
    if (scope) {
      update('Git');
      try {
        await this.commits.reconcile(scope);
        checks.push({
          id: 'Git',
          status: 'ready',
          detail: 'All workspace changes are saved.',
          repairPrompt: null,
          helpUrl: null,
        });
      } catch (error) {
        checks.push({
          id: 'Git',
          status: 'error',
          detail: String(error),
          repairPrompt: 'Check Git installation and save pending workspace changes without discarding files.',
          helpUrl: 'https://git-scm.com/downloads',
        });
      }
    }
    if (video) {
      update('Hyperframes');
      const mediaChecks = await this.media.checks((check) => {
        checks.push(check);
        update(check.id);
      });
      for (const check of mediaChecks) if (!checks.some((value) => value.id === check.id)) checks.push(check);
      if (scope) {
        try {
          const capabilities = await this.agent.capabilities(await this.store.projectPath(scope));
          if (capabilities.skills.some((skill) => skill.name.includes('hyperframes')))
            for (const check of checks)
              if (check.id.toLowerCase().includes('skill')) {
                check.status = 'ready';
                check.detail = 'Hyperframes skill is available to Codex.';
              }
        } catch {
          /* The Codex diagnostic already describes connection failures. */
        }
      }
    }
    update('', true);
    return checks;
  }
}
