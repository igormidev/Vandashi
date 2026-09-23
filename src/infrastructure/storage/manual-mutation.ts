import { constants } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitPort } from '../../domain/storage';
import { AppFault } from '../../domain/diagnostics';
import { atomicWrite, containedPath, errorCode, hashFile, isWithin } from './files';
import type { WriteReceipt } from './files';

interface FileBackup {
  path: string;
  copy: string | null;
  mode: number | null;
  hash: string | null;
}
interface Checkpoint {
  head: string;
  index: string;
  files: Record<string, string | null>;
  paths: string[];
}
interface Mutation<T> {
  key: string;
  repositories: string[];
  paths: string[];
  commit: { title: string; body: string };
  mutate: (receipt: WriteReceipt) => Promise<T>;
}
interface Recovery {
  checkpoints: Map<string, Checkpoint>;
  completed: Set<string>;
  committed: boolean;
  backups: FileBackup[];
  directories: string[];
  indexes: Map<string, string>;
  result: unknown;
}

async function fileHash(root: string, path: string): Promise<string | null> {
  try {
    const safe = await containedPath(root, path);
    const info = await lstat(safe);
    if (!info.isFile() || info.isSymbolicLink()) throw new AppFault({ id: 'storageWorkspaceConflict' });
    return await hashFile(safe);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

function partialStage(before: string, staged: string, actual: string): boolean {
  const records = (value: string) => {
    const result = new Map<string, string[]>();
    for (const record of value.split('\0').filter(Boolean)) {
      const path = record.slice(record.indexOf('\t') + 1);
      result.set(path, [...(result.get(path) ?? []), record]);
    }
    return result;
  };
  const original = records(before);
  const expected = records(staged);
  const current = records(actual);
  return [...new Set([...original.keys(), ...expected.keys(), ...current.keys()])].every((path) => {
    const value = JSON.stringify(current.get(path) ?? []);
    return (
      value === JSON.stringify(original.get(path) ?? []) || value === JSON.stringify(expected.get(path) ?? [])
    );
  });
}

function indexPaths(entries: string): string[] {
  return entries
    .split('\0')
    .filter(Boolean)
    .map((entry) => entry.slice(entry.indexOf('\t') + 1));
}

/** Roll back only verifiably owned writes. Partial multi-repository commits resume without rewriting files. */
export class ManualMutation {
  private readonly pending = new Map<string, Recovery>();
  constructor(private readonly git: GitPort) {}

  private async checkpoint(repository: string, paths: string[]): Promise<Checkpoint> {
    const dirty = (await this.git.status(repository)).paths.map((path) => join(repository, path));
    const files = [...new Set([...paths, ...dirty])].sort();
    const hashes = await Promise.all(
      files.map(async (path) => [path, await fileHash(repository, path)] as const),
    );
    return {
      head: await this.git.head(repository),
      index: await this.git.indexEntries(repository),
      files: Object.fromEntries(hashes),
      paths: files,
    };
  }

  private ownedPaths(repository: string, paths: string[]): string[] {
    return paths.filter((path) => isWithin(repository, path));
  }

  private async assertCurrent(recovery: Recovery): Promise<void> {
    for (const [repository, expected] of recovery.checkpoints) {
      const current = await this.checkpoint(repository, expected.paths);
      if (JSON.stringify(current) !== JSON.stringify(expected))
        throw new AppFault({ id: 'storageWorkspaceConflict' });
    }
  }

  private async prepare<T>(input: Mutation<T>): Promise<Recovery> {
    const recovery: Recovery = {
      checkpoints: new Map(),
      completed: new Set(),
      committed: false,
      backups: [],
      directories: [],
      indexes: new Map(),
      result: undefined,
    };
    try {
      for (const repository of input.repositories) {
        const paths = this.ownedPaths(repository, input.paths);
        const checkpoint = await this.checkpoint(repository, paths);
        recovery.checkpoints.set(repository, checkpoint);
        recovery.indexes.set(repository, checkpoint.index);
        if (paths.length === 0) continue;
        const recoveryRoot = await containedPath(repository, '.vandashi-recovery');
        await mkdir(recoveryRoot, { recursive: true });
        const directory = await mkdtemp(join(recoveryRoot, 'manual-'));
        recovery.directories.push(directory);
        for (const path of paths) {
          if (recovery.backups.some((backup) => backup.path === path)) continue;
          const hash = checkpoint.files[path];
          if (hash === undefined) throw new AppFault({ id: 'storageWorkspaceConflict' });
          const copy = hash === null ? null : join(directory, String(recovery.backups.length));
          if (copy) {
            await copyFile(path, copy, constants.COPYFILE_EXCL);
            if ((await hashFile(copy)) !== hash) throw new AppFault({ id: 'storageWorkspaceConflict' });
          }
          recovery.backups.push({ path, copy, mode: copy ? (await lstat(path)).mode : null, hash });
        }
      }
      for (const directory of recovery.directories)
        await atomicWrite(
          join(directory, 'manifest.json'),
          JSON.stringify(
            {
              request: input.key,
              files: recovery.backups,
              indexes: [...recovery.indexes],
            },
            null,
            2,
          ),
        );
      return recovery;
    } catch (error) {
      await this.dispose(recovery);
      throw error;
    }
  }

  private async dispose(recovery: Recovery): Promise<void> {
    for (const directory of recovery.directories) await rm(directory, { recursive: true, force: true });
  }

  private async rollback<T>(recovery: Recovery, input: Mutation<T>): Promise<void> {
    await this.assertCurrent(recovery);
    for (const [repository, original] of recovery.indexes) {
      const expected = recovery.checkpoints.get(repository)?.index ?? '';
      const paths = [...new Set([...indexPaths(original), ...indexPaths(expected)])];
      if (paths.length) await this.git.restoreIndexEntries(repository, paths, original, expected);
    }
    for (const backup of recovery.backups) {
      const repository = input.repositories.find((root) => this.ownedPaths(root, [backup.path]).length > 0);
      if (!repository) throw new AppFault({ id: 'storageWorkspaceConflict' });
      const safe = await containedPath(repository, backup.path);
      const current = await fileHash(repository, safe);
      if (current !== recovery.checkpoints.get(repository)?.files[safe])
        throw new AppFault({ id: 'storageWorkspaceConflict' });
      // A failed installation leaves the original untouched; do not repeat the failing write to it.
      if (current === backup.hash) continue;
      if (backup.copy) {
        await atomicWrite(safe, await readFile(backup.copy));
        if (backup.mode !== null) await chmod(safe, backup.mode);
      } else await rm(safe, { force: true });
    }
    await this.dispose(recovery);
  }

  private async mutate<T>(recovery: Recovery, input: Mutation<T>): Promise<T> {
    const versions = new Map<string, Set<string | null>>();
    for (const checkpoint of recovery.checkpoints.values())
      for (const path of input.paths) {
        const hash = checkpoint.files[path];
        if (hash !== undefined) versions.set(path, new Set([hash]));
      }
    try {
      // Receipts identify intended bytes before installation, which itself can still fail.
      return await input.mutate((path, hash) => {
        const known = versions.get(path);
        if (!known) throw new AppFault({ id: 'storageWorkspaceConflict' });
        known.add(hash);
        for (const checkpoint of recovery.checkpoints.values())
          if (Object.hasOwn(checkpoint.files, path)) checkpoint.files[path] = hash;
      });
    } catch (error) {
      const verified = new Map<string, Checkpoint>();
      for (const [repository, expected] of recovery.checkpoints) {
        const current = await this.checkpoint(repository, expected.paths);
        const files = { ...expected.files };
        for (const [path, hash] of Object.entries(current.files))
          if (versions.get(path)?.has(hash)) files[path] = hash;
        const candidate = { ...expected, files };
        // Accept only original/announced bytes. HEAD, index, unrelated files and path sets stay exact.
        if (JSON.stringify(current) !== JSON.stringify(candidate))
          throw new AppFault({ id: 'storageWorkspaceConflict' });
        verified.set(repository, candidate);
      }
      for (const [repository, checkpoint] of verified) recovery.checkpoints.set(repository, checkpoint);
      throw error;
    }
  }

  async run<T>(input: Mutation<T>): Promise<T> {
    const existing = this.pending.get(input.key);
    const recovery = existing ?? (await this.prepare(input));
    await this.assertCurrent(recovery);
    try {
      if (!existing) recovery.result = await this.mutate(recovery, input);
      for (const repository of input.repositories) {
        if (recovery.completed.has(repository)) continue;
        await this.assertCurrent(recovery);
        const before = recovery.checkpoints.get(repository);
        const staged = await this.git.stagedIndexEntries(repository);
        await this.assertCurrent(recovery);
        try {
          await this.git.stage(repository);
        } catch (error) {
          const currentIndex = await this.git.indexEntries(repository);
          if (before && partialStage(before.index, staged, currentIndex))
            recovery.checkpoints.set(repository, { ...before, index: currentIndex });
          throw error;
        }
        if (!before || (await this.git.indexEntries(repository)) !== staged)
          throw new AppFault({ id: 'storageWorkspaceConflict' });
        recovery.checkpoints.set(repository, { ...before, index: staged });
        await this.assertCurrent(recovery);
        const head = await this.git.commit(repository, input.commit.title, input.commit.body);
        const checkpoint = recovery.checkpoints.get(repository);
        if (checkpoint?.head !== head) recovery.committed = true;
        if (checkpoint) recovery.checkpoints.set(repository, { ...checkpoint, head });
        recovery.completed.add(repository);
      }
      await this.assertCurrent(recovery);
      this.pending.delete(input.key);
      await this.dispose(recovery);
      return recovery.result as T;
    } catch (error) {
      await this.assertCurrent(recovery);
      if (!recovery.committed) await this.rollback(recovery, input);
      else this.pending.set(input.key, recovery);
      throw error;
    }
  }

  has(key: string): boolean {
    return this.pending.has(key);
  }
}
