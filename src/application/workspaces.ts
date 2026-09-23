import type { SaveInput, Scope } from '../domain/models';
import type { GitPort, StoragePort } from '../domain/storage';

/** App workflows depend on ports; filesystem and process details stay in adapters. */
export class Workspaces {
  constructor(
    readonly storage: StoragePort,
    readonly git: GitPort,
  ) {}

  async ensureCommitted(scope: Scope): Promise<void> {
    for (const repository of await this.storage.repositories(scope)) {
      const status = await this.git.status(repository);
      if (status.dirty)
        await this.git.commit(
          repository,
          'Recover pending workspace changes',
          `Preserve previously uncommitted files: ${status.paths.join(', ')}.`,
        );
      if ((await this.git.status(repository)).dirty)
        throw new Error('Workspace changes could not be committed.');
    }
  }

  async open(scope: Scope) {
    await this.storage.openWorkspace(scope); // Validate schemas and synchronize shared assets first.
    await this.ensureCommitted(scope);
    return this.storage.openWorkspace(scope);
  }

  save(input: SaveInput) {
    return this.storage.saveWorkspace(input);
  }
  async history(input: { scope: Scope; page: number }) {
    return this.git.history(await this.storage.projectPath(input.scope), input.page);
  }
  async changes(scope: Scope) {
    const path = await this.storage.projectPath(scope);
    return { dirty: (await this.git.status(path)).dirty, files: await this.git.diff(path) };
  }
}
