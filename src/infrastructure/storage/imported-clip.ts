import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { AppFault } from '../../domain/diagnostics';
import { numberedImportName } from '../../domain/import-names';
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
  const directory = await containedPath(parent.path, 'clips');
  const base = safeName(input.name);
  const entries = new Set((await readdir(directory)).map((name) => name.normalize('NFC').toLowerCase()));
  let name = base;
  for (let ordinal = 1; entries.has(name.normalize('NFC').toLowerCase()); ordinal++)
    name = numberedImportName(base, ordinal + 1);
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
