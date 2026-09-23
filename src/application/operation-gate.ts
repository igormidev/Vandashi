import { AppFault } from '../domain/diagnostics';
/** One lease covers chat and all automatic helpers, including recovery and commits. */
export class OperationGate {
  constructor(private readonly onChange: (owner: string | null) => void = () => undefined) {}
  private owner: string | null = null;
  private readonly idleWaiters = new Set<() => void>();
  get busy(): boolean {
    return this.owner !== null;
  }
  get readingWorkspace(): boolean {
    return this.owner === 'workspace-read';
  }
  assertIdle(): void {
    if (this.busy) throw new AppFault({ id: 'appOperationBusy' });
  }
  private notify(owner: string | null): void {
    try {
      this.onChange(owner);
    } catch {
      /* A closed renderer cannot invalidate an operation lease. */
    }
  }
  waitUntilIdle(): Promise<void> {
    return this.busy
      ? new Promise((resolve) => {
          this.idleWaiters.add(resolve);
        })
      : Promise.resolve();
  }
  acquire(owner: string, announce = true): () => void {
    this.assertIdle();
    this.owner = owner;
    if (announce) this.notify(owner);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.owner = null;
      if (announce) this.notify(null);
      for (const resolve of this.idleWaiters) resolve();
      this.idleWaiters.clear();
    };
  }
  async runStartup<T>(owner: 'open-chat' | 'studio-open', task: () => Promise<T>): Promise<T> {
    const other = owner === 'open-chat' ? 'studio-open' : 'open-chat';
    // The completed workspace mounts both consumers. Serialize their passive startup work,
    // including when both first waited behind a workspace read; edits still fail immediately.
    while (this.owner === 'workspace-read' || this.owner === other) await this.waitUntilIdle();
    return this.run(owner, task);
  }
  async run<T>(owner: string, task: () => Promise<T>, announce = true): Promise<T> {
    // Focus-triggered snapshots may already be reading when a native picker returns.
    // Finish that passive read before accepting foreground work; never queue behind another edit.
    if (this.owner === 'workspace-read') await this.waitUntilIdle();
    const release = this.acquire(owner, announce);
    try {
      return await task();
    } finally {
      release();
    }
  }
}
