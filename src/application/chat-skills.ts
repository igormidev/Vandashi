import type { AgentPort } from '../domain/agent';
import type { ChatSkill } from '../domain/chat-skills';
import { AppFault } from '../domain/diagnostics';
import type { StoragePort } from '../domain/storage';

/** Fresh provider discovery uses manifest-only scope reads, never workspace hydration. */
export class ChatSkills {
  private readonly pending = new Map<string, Promise<ChatSkill[]>>();
  constructor(
    private readonly store: StoragePort,
    private readonly agent: AgentPort,
  ) {}
  read(sessionId: string): Promise<ChatSkill[]> {
    const existing = this.pending.get(sessionId);
    if (existing) return existing;
    const promise = this.readFresh(sessionId).finally(() => {
      if (this.pending.get(sessionId) === promise) this.pending.delete(sessionId);
    });
    this.pending.set(sessionId, promise);
    return promise;
  }
  private async readFresh(sessionId: string): Promise<ChatSkill[]> {
    const session = await this.store.getSession(sessionId);
    if (!session.open) throw new AppFault({ id: 'untrustedRequest' });
    const { cwd } = await this.store.discoverAgentScope(session.scope);
    const { skills } = await this.agent.capabilities(cwd);
    const names = new Set<string>();
    return skills
      .flatMap((skill) => {
        if (
          !skill.path.trim() ||
          !/^[\p{L}\p{N}][\p{L}\p{N}_.:-]{0,199}$/u.test(skill.name) ||
          names.has(skill.name)
        )
          return [];
        names.add(skill.name);
        return [{ name: skill.name, description: skill.description.slice(0, 8192) }];
      })
      .slice(0, 500);
  }
}
