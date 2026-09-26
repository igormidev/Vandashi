import { relative } from 'node:path';
import { AppFault } from '../domain/diagnostics';
import type { FileChange } from '../domain/models';
import type { GitPort } from '../domain/storage';

interface Entry {
  baseline: string;
  head: string;
  preserved: boolean;
  approved: boolean;
  restored: boolean;
  pending?: { index: string; files: string };
}
interface Recovery {
  entries: Map<string, Entry>;
  pending: boolean;
  ready: boolean;
  reviewed?: { title: string; body: string };
}

/** Retain exact owned safety heads until every repository is approved or restored. */
export class StudioRecovery {
  private readonly states = new Map<string, Recovery>();
  constructor(private readonly git: GitPort) {}
  async open(path: string): Promise<void> {
    const state = this.states.get(path);
    const ownsRecovery =
      state?.pending &&
      (state.reviewed !== undefined || [...state.entries.values()].some((entry) => entry.preserved));
    if (!(await this.git.status(path)).dirty && !ownsRecovery) {
      const head = await this.git.head(path);
      this.states.set(path, {
        entries: new Map([[path, this.entry(head)]]),
        pending: false,
        ready: false,
      });
    } else if (!state) throw new AppFault({ id: 'appSaveBeforeStudio' });
  }
  private entry(head: string): Entry {
    return { baseline: head, head, preserved: false, approved: false, restored: false };
  }
  private state(path: string): Recovery {
    const state = this.states.get(path);
    if (!state) throw new AppFault({ id: 'appStudioCheckpointMissing' });
    return state;
  }
  private async snapshot(path: string) {
    return { index: await this.git.indexEntries(path), files: await this.git.stagedIndexEntries(path) };
  }
  private async assertOwned(path: string, entry: Entry): Promise<void> {
    if ((await this.git.head(path)) !== entry.head) throw new AppFault({ id: 'appStudioCheckpointChanged' });
    if (entry.pending) {
      const current = await this.snapshot(path);
      if (current.index !== entry.pending.index || current.files !== entry.pending.files)
        throw new AppFault({ id: 'storageWorkspaceConflict' });
    }
  }
  async prepare(path: string, repositories: string[], reviewed: { title: string; body: string }) {
    const state = this.state(path);
    for (const repository of repositories) {
      let entry = state.entries.get(repository);
      if (!entry) {
        if ((await this.git.status(repository)).dirty) throw new AppFault({ id: 'appStudioOtherChanges' });
        entry = this.entry(await this.git.head(repository));
        state.entries.set(repository, entry);
      }
      await this.assertOwned(repository, entry);
      if (entry.approved && (await this.git.status(repository)).dirty)
        throw new AppFault({ id: 'storageWorkspaceConflict' });
      if (repository !== path && !entry.pending && (await this.git.status(repository)).dirty)
        throw new AppFault({ id: 'appStudioOtherChanges' });
    }
    if ([...state.entries.keys()].some((repository) => !repositories.includes(repository)))
      throw new AppFault({ id: 'appStudioCheckpointChanged' });
    if (!state.ready) for (const entry of state.entries.values()) delete entry.pending;
    state.reviewed ??= { ...reviewed };
    state.pending = true;
    return state.ready;
  }
  ready(path: string): void {
    this.state(path).ready = true;
  }
  async preserve(path: string, discarded = false): Promise<void> {
    const state = this.state(path);
    state.pending = true;
    let failure: { error: unknown } | undefined;
    for (const [repository, entry] of state.entries) {
      try {
        await this.assertOwned(repository, entry);
        entry.pending = await this.snapshot(repository);
        if ((await this.git.status(repository)).dirty) {
          entry.head = await this.git.commit(
            repository,
            discarded ? 'Preserve discarded Studio edits' : 'Preserve unfinished Studio save',
            'Safety snapshot of Studio changes before retrying synchronization or restoring the editor checkpoint.',
            entry.head,
          );
          entry.preserved = true;
        }
        delete entry.pending;
      } catch (error) {
        failure ??= { error };
      }
    }
    if (failure) throw failure.error;
  }
  async approve(path: string): Promise<void> {
    const state = this.state(path);
    if (!state.reviewed || !state.ready) throw new AppFault({ id: 'appStudioCheckpointMissing' });
    // Capture the intended final bytes before any commit, so a partial failure cannot adopt later edits.
    for (const [repository, entry] of state.entries) {
      await this.assertOwned(repository, entry);
      entry.pending ??= await this.snapshot(repository);
    }
    for (const [repository, entry] of state.entries) {
      if (entry.approved) continue;
      await this.assertOwned(repository, entry);
      if (repository === path || (await this.git.status(repository)).dirty || entry.preserved) {
        entry.head = await this.git.commit(repository, state.reviewed.title, state.reviewed.body, entry.head);
        entry.preserved = true;
      }
      entry.approved = true;
      delete entry.pending;
    }
  }
  complete(path: string): void {
    this.states.delete(path);
  }
  async discard(path: string): Promise<void> {
    const state = this.state(path);
    if (!state.pending) await this.preserve(path, true);
    for (const [repository, entry] of [...state.entries].reverse()) {
      if (entry.restored) {
        await this.assertOwned(repository, entry);
        if ((await this.git.status(repository)).dirty) throw new AppFault({ id: 'gitRestoreDirty' });
        continue;
      }
      if (entry.pending) {
        await this.assertOwned(repository, entry);
        entry.head = await this.git.commit(
          repository,
          'Preserve unfinished Studio save',
          'Safety snapshot of pending Studio changes before restoring the editor checkpoint.',
          entry.head,
        );
        entry.preserved = true;
        delete entry.pending;
      }
      if (entry.preserved) entry.head = await this.git.restore(repository, entry.baseline, entry.head);
      else {
        await this.assertOwned(repository, entry);
        if ((await this.git.status(repository)).dirty) throw new AppFault({ id: 'gitRestoreDirty' });
      }
      entry.restored = true;
    }
    this.states.delete(path);
  }
  async changes(path: string): Promise<{ dirty: boolean; files: FileChange[] }> {
    const state = this.states.get(path);
    const entries = state?.entries ?? new Map([[path, undefined]]);
    const files: FileChange[] = [];
    let dirty = state?.pending ?? false;
    for (const [repository, entry] of entries) {
      dirty ||= (await this.git.status(repository)).dirty;
      const preserved =
        entry?.preserved && !entry.restored
          ? await this.git.diffBetween(repository, entry.baseline, entry.head)
          : [];
      const merged = new Map(preserved.map((file) => [file.path, file]));
      for (const file of await this.git.diff(repository)) {
        const prior = merged.get(file.path);
        merged.set(
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
      const prefix = relative(path, repository).split('\\').join('/');
      files.push(
        ...[...merged.values()].map((file) => ({
          ...file,
          path: prefix ? `${prefix}/${file.path}` : file.path,
        })),
      );
    }
    return { dirty, files };
  }
}
