import { AppFault } from '../../domain/diagnostics';
import { constants, type Stats } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readdir, rm, rmdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { GitPort, ImportedVideo } from '../../domain/storage';
import type { VideoRecord } from './schemas';
import { assetKind, metadataSuffix } from './assets';
import { atomicWrite, containedPath, errorCode, hashFile, safeName } from './files';
import { writeYaml } from './yaml-files';
import { publishImportedDirectory } from './import-publication';

async function removeOwnedStaging(path: string, identity: Pick<Stats, 'dev' | 'ino'>): Promise<void> {
  const current = await lstat(path).catch((error: unknown) => {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  });
  if (!current) return;
  if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino)
    throw new AppFault({ id: 'storageImportStagingChanged', params: { path } });
  await rm(path, { recursive: true, force: true });
}

async function guardStaging(path: string, identity: Pick<Stats, 'dev' | 'ino'>): Promise<void> {
  const current = await lstat(path);
  if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino)
    throw new AppFault({ id: 'storageImportStagingChanged', params: { path } });
}

export class ImportedMediaHashes {
  private readonly entries = new Map<string, { stamp: string; hash: string }>();
  async revision(path: string): Promise<string> {
    const metadata = await stat(path);
    const stamp = `${String(metadata.size)}:${String(metadata.mtimeMs)}:${String(metadata.ctimeMs)}`;
    const prior = this.entries.get(path);
    const hash = prior?.stamp === stamp ? prior.hash : await hashFile(path);
    this.entries.set(path, { stamp, hash });
    return `media:${hash}`;
  }
}

export async function initializeImportedVideo(
  directory: string,
  input: Pick<ImportedVideo, 'name' | 'sourcePath'>,
  record: VideoRecord,
  git: GitPort,
  initialize: (path: string) => Promise<void>,
  validateCopy: (path: string) => Promise<void>,
): Promise<VideoRecord> {
  const source = await lstat(input.sourcePath);
  if (!source.isFile() || source.isSymbolicLink() || assetKind(input.sourcePath) !== 'video')
    throw new AppFault({ id: 'storageVideoFileRequired' });
  const filename = safeName(basename(input.sourcePath));
  const destination = await containedPath(directory, safeName(input.name));
  await mkdir(destination); // Reserve this name; never adopt an existing directory.
  const reserved = await lstat(destination);
  let staging: string | undefined;
  let stagingIdentity: Pick<Stats, 'dev' | 'ino'> | undefined;
  try {
    staging = await mkdtemp(join(directory, '.vandashi-import-'));
    stagingIdentity = await lstat(staging);
    await initialize(staging);
    const copied = join(staging, 'video_assets', filename);
    const before = await hashFile(input.sourcePath);
    await copyFile(input.sourcePath, copied, constants.COPYFILE_EXCL);
    const copiedHash = await hashFile(copied);
    if (before !== copiedHash || (await hashFile(input.sourcePath)) !== before)
      throw new AppFault({ id: 'appImportedVideoChanged' });
    await validateCopy(copied);
    await guardStaging(staging, stagingIdentity);
    await atomicWrite(
      copied + metadataSuffix,
      JSON.stringify({
        title: record.name,
        description: 'Imported finished video.',
        tags: [],
        hash: copiedHash,
        contentHash: copiedHash,
        metadataStorage: 'sidecar',
        preserveBytes: true,
      }),
    );
    const importedRecord: VideoRecord = {
      ...record,
      renderedPath: `video_assets/${filename}`,
      renderedRevision: `media:${copiedHash}`,
    };
    await writeYaml(staging, '.vandashi.yml', importedRecord);
    await git.commit(
      staging,
      `Import finished video: ${record.name}`,
      'Preserve the original finished media and initialize its release workspace.',
    );
    const current = await lstat(destination);
    if (
      !current.isDirectory() ||
      current.dev !== reserved.dev ||
      current.ino !== reserved.ino ||
      (await readdir(destination)).length
    )
      throw new AppFault({ id: 'storageImportReservationChanged' });
    await publishImportedDirectory(staging, destination, reserved);
    return importedRecord;
  } catch (error) {
    try {
      const current = await lstat(destination);
      if (!current.isDirectory() || current.dev !== reserved.dev || current.ino !== reserved.ino)
        throw new AppFault({ id: 'storageImportReservationChanged' });
      await rmdir(destination); // Only empty, still-owned reservations may be removed.
    } catch (cleanupError) {
      if (errorCode(cleanupError) !== 'ENOENT')
        throw new AppFault(
          { id: 'storageImportFilesPreserved', params: { path: destination } },
          error instanceof Error ? error.message : String(error),
        );
    }
    throw error;
  } finally {
    if (staging && stagingIdentity) await removeOwnedStaging(staging, stagingIdentity);
  }
}
