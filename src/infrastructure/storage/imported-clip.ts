import { randomUUID } from 'node:crypto';
import { AppFault } from '../../domain/diagnostics';
import type { VideoSummary } from '../../domain/models';
import type { GitPort, ImportedClip } from '../../domain/storage';
import type { VideoRecord } from './schemas';
import { containedPath, safeName } from './files';
import { initializeImportedVideo } from './finished-video';

export async function initializeImportedClip(
  parent: VideoSummary | null,
  input: ImportedClip,
  git: GitPort,
  initialize: (path: string, record: VideoRecord) => Promise<void>,
  validateCopy: (path: string) => Promise<void>,
): Promise<{ path: string; record: VideoRecord }> {
  if (parent?.ratio !== '16:9') throw new AppFault({ id: 'storageClipLandscapeRequired' });
  if (!Number.isFinite(input.duration) || input.duration <= 0)
    throw new AppFault({ id: 'storageClipRangeInvalid' });
  const name = safeName(input.name, 3);
  const directory = await containedPath(parent.path, 'clips');
  const path = await containedPath(directory, name);
  const record: VideoRecord = {
    id: randomUUID(),
    brandId: parent.brandId,
    name,
    ratio: input.ratio,
    origin: 'imported',
    updatedAt: new Date().toISOString(),
    renderedPath: null,
    parentVideoId: parent.id,
    start: 0,
    end: input.duration,
  };
  const imported = await initializeImportedVideo(
    directory,
    { name, sourcePath: input.sourcePath },
    record,
    git,
    (staging) => initialize(staging, record),
    validateCopy,
  );
  return { path, record: imported };
}
