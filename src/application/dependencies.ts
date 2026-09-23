import type { AgentPort } from '../domain/agent';
import { AppFault, diagnosticFromError } from '../domain/diagnostics';
import type { AppMessage } from '../domain/messages';
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
    const update = (current: string, complete = false, currentLabel?: AppMessage) => {
      this.emit({
        type: 'checks',
        scope,
        video,
        checks: [...checks],
        progress: complete ? 1 : Math.min(checks.length / total, 0.95),
        current,
        ...(currentLabel ? { currentLabel } : {}),
      });
    };
    update('Codex');
    try {
      const status = await this.agent.connect();
      const fault = !status.authenticated
        ? new AppFault({ id: 'appCodexLoginRequired' })
        : status.usageAllowed === false
          ? new AppFault({ id: 'appUsageExhausted' })
          : null;
      checks.push({
        id: 'Codex',
        status: status.authenticated && status.usageAllowed !== false ? 'ready' : 'missing',
        detail: fault?.message ?? status.version,
        ...(fault ? { diagnostic: fault.diagnostic } : {}),
        repairPrompt: null,
        helpUrl: 'https://developers.openai.com/codex/cli/',
      });
    } catch (error) {
      checks.push({
        id: 'Codex',
        status: 'missing',
        detail: String(error),
        diagnostic: diagnosticFromError(error),
        repairPrompt: null,
        helpUrl: 'https://developers.openai.com/codex/cli/',
      });
    }
    if (scope) {
      update('Git');
      try {
        await this.commits.reconcile(scope);
        const fault = new AppFault({ id: 'appWorkspaceSaved' });
        checks.push({
          id: 'Git',
          status: 'ready',
          detail: fault.message,
          diagnostic: fault.diagnostic,
          repairPrompt: null,
          helpUrl: null,
        });
      } catch (error) {
        checks.push({
          id: 'Git',
          status: 'error',
          detail: String(error),
          diagnostic: diagnosticFromError(error),
          repairPrompt: 'Check Git installation and save pending workspace changes without discarding files.',
          helpUrl: 'https://git-scm.com/downloads',
        });
      }
    }
    if (video) {
      update('Hyperframes', false, { id: 'mediaHyperframesLabel' });
      const mediaChecks = await this.media.checks((check) => {
        checks.push(check);
        update(check.id, false, check.label);
      });
      for (const check of mediaChecks) if (!checks.some((value) => value.id === check.id)) checks.push(check);
      if (scope) {
        try {
          const capabilities = await this.agent.capabilities(await this.store.projectPath(scope));
          if (capabilities.skills.some((skill) => skill.name.includes('hyperframes')))
            for (const check of checks)
              if (check.id.toLowerCase().includes('skill')) {
                const fault = new AppFault({ id: 'appHyperframesSkillReady' });
                check.status = 'ready';
                check.detail = fault.message;
                check.diagnostic = fault.diagnostic;
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
