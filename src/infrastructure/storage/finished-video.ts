import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { GitPort, ImportedVideo } from '../../domain/storage';
import type { VideoRecord } from './schemas';
import { assetKind, metadataSuffix } from './assets';
import { atomicWrite, containedPath, hashFile, safeName } from './files';
import { writeYaml } from './yaml-files';

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
  input: ImportedVideo,
  record: VideoRecord,
  git: GitPort,
  initialize: (path: string) => Promise<void>,
  validateCopy: (path: string) => Promise<void>,
): Promise<void> {
  const source = await lstat(input.sourcePath);
  if (!source.isFile() || source.isSymbolicLink() || assetKind(input.sourcePath) !== 'video')
    throw new Error('Choose a regular supported video file.');
  const filename = safeName(basename(input.sourcePath));
  const destination = await containedPath(directory, safeName(input.name));
  await mkdir(destination); // Reserve this name; never adopt an existing directory.
  let staging: string | undefined;
  try {
    staging = await mkdtemp(join(directory, '.vandashi-import-'));
    await initialize(staging);
    const copied = join(staging, 'video_assets', filename);
    const before = await hashFile(input.sourcePath);
    await copyFile(input.sourcePath, copied, constants.COPYFILE_EXCL);
    const copiedHash = await hashFile(copied);
    if (before !== copiedHash || (await hashFile(input.sourcePath)) !== before)
      throw new Error('The selected video changed while it was imported. Select it again.');
    await validateCopy(copied);
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
    await writeYaml(staging, '.vandashi.yml', {
      ...record,
      renderedPath: `video_assets/${filename}`,
      renderedRevision: `media:${copiedHash}`,
    });
    await git.commit(
      staging,
      `Import finished video: ${record.name}`,
      'Preserve the original finished media and initialize its release workspace.',
    );
    // Publish the manifest last: listVideos never exposes a half-imported workspace.
    for (const name of await readdir(staging))
      if (name !== '.vandashi.yml') await rename(join(staging, name), join(destination, name));
    await rename(join(staging, '.vandashi.yml'), join(destination, '.vandashi.yml'));
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}
