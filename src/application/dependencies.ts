import type { AgentPort } from '../domain/agent';
import { AppFault, diagnosticEnglish, diagnosticFromError, type Diagnostic } from '../domain/diagnostics';
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
      const fault = !status.connected
        ? new AppFault({ id: 'codexDisconnected' })
        : !status.authenticated
          ? new AppFault({ id: 'appCodexLoginRequired' })
          : status.usageAllowed === false
            ? new AppFault({ id: 'appUsageExhausted' })
            : status.accountType === 'chatgpt' && status.usageAllowed === null
              ? new AppFault({ id: 'appUsageUnverified' })
              : null;
      checks.push({
        id: 'Codex',
        status: fault ? 'missing' : 'ready',
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
    const codexReady = checks.some((check) => check.id === 'Codex' && check.status === 'ready');
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
        const cause = diagnosticFromError(error);
        checks.push({
          id: 'Git',
          status: 'error',
          detail: diagnosticEnglish(cause),
          diagnostic: cause,
          recovery: { id: 'appWorkspaceRecoveryRequired' },
          // Chat preflight requires working Git and clean repositories; it cannot repair this failure.
          repairPrompt: null,
          helpUrl: 'https://git-scm.com/downloads',
        });
      }
    }
    if (video) {
      update('Hyperframes', false, { id: 'mediaHyperframesLabel' });
      const mediaChecks = await this.media.checks((check) => {
        // Only live Codex discovery can establish core-skill readiness.
        if (check.id === 'skill') return;
        // This port checks the host runtime, without a verified repository-contained repair target.
        checks.push({ ...check, repairPrompt: null });
        update(check.id, false, check.label);
      });
      for (const check of mediaChecks)
        if (check.id !== 'skill' && !checks.some((value) => value.id === check.id))
          checks.push({ ...check, repairPrompt: null });
      update('skill', false, { id: 'mediaSkillLabel' });
      checks.push(await this.skill(scope, codexReady));
    }
    update('', true);
    return checks;
  }

  private async skill(scope: Scope | null, codexReady: boolean): Promise<DependencyCheck> {
    let status: DependencyCheck['status'] = 'missing';
    let fault = new AppFault({ id: 'appHyperframesSkillUnverified' });
    let cause: Diagnostic | undefined;
    if (scope && codexReady) {
      try {
        // The agent adapter exposes only valid, explicitly enabled skills from force-reloaded discovery.
        const capabilities = await this.agent.capabilities(await this.store.projectPath(scope));
        const ready = capabilities.skills.some(
          (skill) => skill.name === 'hyperframes' && !!skill.path.trim(),
        );
        status = ready ? 'ready' : 'missing';
        fault = new AppFault({ id: ready ? 'appHyperframesSkillReady' : 'appHyperframesSkillMissing' });
      } catch (error) {
        status = 'error';
        cause = diagnosticFromError(error);
      }
    }
    return {
      id: 'skill',
      label: { id: 'mediaSkillLabel' },
      status,
      detail: cause ? diagnosticEnglish(cause) : fault.message,
      diagnostic: cause ?? fault.diagnostic,
      ...(cause ? { recovery: { id: 'appHyperframesSkillUnverified' as const } } : {}),
      repairPrompt: null,
      helpUrl: 'https://hyperframes.heygen.com/guides/skills',
    };
  }
}
