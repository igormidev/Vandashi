import { lstat, mkdir, mkdtemp, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AppFault } from '../../domain/diagnostics';
import type { GitPort, ProjectPreparation } from '../../domain/storage';
import { containedPath, errorCode } from './files';
import { publishImportedDirectory } from './import-publication';
import type { VideoRecord } from './schemas';

type Identity = { ino: number; dev: number };
async function sameDirectory(path: string, expected: Identity): Promise<boolean> {
  const current = await lstat(path).catch((error: unknown) => {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  });
  return (
    !!current?.isDirectory() &&
    !current.isSymbolicLink() &&
    current.ino === expected.ino &&
    current.dev === expected.dev
  );
}

/** Prepare and commit before making a discoverable project; published paths are never recursively removed. */
export async function initializeComposition<T>(
  directory: string,
  record: VideoRecord,
  git: GitPort,
  initialize: (path: string) => Promise<void>,
  prepare: ProjectPreparation | undefined,
  inspect: (path: string) => Promise<T>,
): Promise<{ path: string; prepared: T }> {
  const destination = await containedPath(directory, record.name);
  await lstat(destination).then(
    () => {
      throw new AppFault({ id: 'storageProjectExists' });
    },
    (error: unknown) => {
      if (errorCode(error) !== 'ENOENT') throw error;
    },
  );
  const staging = await mkdtemp(join(directory, '.vandashi-project-'));
  const owned = await lstat(staging);
  try {
    await initialize(staging);
    await prepare?.({ path: staging, name: record.name, ratio: record.ratio });
    if (!(await sameDirectory(staging, owned)))
      throw new AppFault({ id: 'storageProjectPreparationChanged' });
    await git.commit(
      staging,
      record.parentVideoId ? 'Create clip source' : 'Initialize video canvas',
      record.parentVideoId
        ? `Extract ${String(record.start)}s–${String(record.end)}s from the original video.`
        : 'Create a local Hyperframes project and asset workspace.',
    );
    const prepared = await inspect(staging);
    if (!(await sameDirectory(staging, owned)) || (await git.status(staging)).dirty)
      throw new AppFault({ id: 'storageProjectPreparationChanged' });
    await mkdir(destination);
    const reserved = await lstat(destination);
    try {
      if (!(await sameDirectory(destination, reserved)))
        throw new AppFault({ id: 'storageImportReservationChanged' });
      await publishImportedDirectory(staging, destination, reserved);
    } catch (error) {
      // A failed empty reservation can be retried. Never delete copied or externally created children.
      if (await sameDirectory(destination, reserved)) {
        let removed = false;
        try {
          await rmdir(destination);
          removed = true;
        } catch (cleanupError) {
          removed = errorCode(cleanupError) === 'ENOENT';
        }
        if (removed) throw error;
      }
      throw new AppFault(
        { id: 'storageProjectFilesPreserved', params: { path: destination } },
        error instanceof Error ? error.message : String(error),
      );
    }
    return { path: destination, prepared };
  } finally {
    if (await sameDirectory(staging, owned)) await rm(staging, { recursive: true, force: true });
  }
}
