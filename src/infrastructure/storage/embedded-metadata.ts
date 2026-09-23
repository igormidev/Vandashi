import { AppFault, diagnosticEnglish, diagnosticFromError } from '../../domain/diagnostics';
import type { Diagnostic } from '../../domain/diagnostics';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { ExifTool } from 'exiftool-vendored';
import NodeID3 from 'node-id3';

export interface AssetMetadata {
  title: string;
  description: string;
  tags: string[];
}
export interface EmbeddingResult {
  metadataStorage: 'embedded' | 'sidecar';
  embeddingWarning: string | null;
  embeddingDiagnostic?: Diagnostic;
}
export interface PreparedMetadata {
  result: EmbeddingResult;
  path: string | null;
  dispose: () => Promise<void>;
}
const writableContainers = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.tif',
  '.tiff',
  '.gif',
  '.mp4',
  '.mov',
  '.m4v',
]);

async function writeMp3(path: string, metadata: AssetMetadata): Promise<void> {
  if ((await stat(path)).size > 64 * 1024 * 1024) throw new AppFault({ id: 'storageLargeAudioSidecar' });
  const existing = await NodeID3.Promise.read(path);
  const descriptions = existing.userDefinedText?.filter((tag) => tag.description !== 'Vandashi tags') ?? [];
  await NodeID3.Promise.update(
    {
      title: metadata.title,
      comment: { language: 'eng', text: metadata.description },
      userDefinedText: [
        ...descriptions,
        { description: 'Vandashi tags', value: JSON.stringify(metadata.tags) },
      ],
    },
    path,
  );
  const written = await NodeID3.Promise.read(path);
  if (written.title !== metadata.title || written.comment?.text !== metadata.description)
    throw new AppFault({ id: 'storageAudioMetadataUnverified' });
}

/** Prepare a disposable copy, so callers can check the original revision before installing it. */
export async function prepareEmbeddedMetadata(
  path: string,
  metadata: AssetMetadata,
): Promise<PreparedMetadata> {
  const extension = extname(path).toLowerCase();
  if (!writableContainers.has(extension) && extension !== '.mp3')
    return {
      result: { metadataStorage: 'sidecar', embeddingWarning: null },
      path: null,
      dispose: () => Promise.resolve(),
    };
  const temporary = join(dirname(path), `.vandashi-metadata-${randomUUID()}${extension}`);
  await copyFile(path, temporary, constants.COPYFILE_EXCL);
  const dispose = async () => {
    await rm(temporary, { force: true });
    await rm(`${temporary}_original`, { force: true });
  };
  const tool = new ExifTool({ maxProcs: 1, taskTimeoutMillis: 15_000 });
  try {
    if (extension === '.mp3') await writeMp3(temporary, metadata);
    else {
      await tool.write(
        temporary,
        { Title: metadata.title, Description: metadata.description, Subject: metadata.tags },
        { writeArgs: ['-overwrite_original'], ignoreMinorErrors: false },
      );
      const written = await tool.read(temporary);
      if (written.Title !== metadata.title || (written.Description ?? '') !== metadata.description)
        throw new AppFault({ id: 'storageEmbeddedMetadataUnverified' });
    }
    return {
      result: { metadataStorage: 'embedded', embeddingWarning: null },
      path: temporary,
      dispose,
    };
  } catch (error) {
    await dispose();
    const diagnostic = diagnosticFromError(error);
    return {
      result: {
        metadataStorage: 'sidecar',
        embeddingWarning: diagnosticEnglish(diagnostic),
        embeddingDiagnostic: diagnostic,
      },
      path: null,
      dispose,
    };
  } finally {
    await tool.end();
  }
}

/** Imports own their new destination; metadata edits instead install a prepared copy after revision checks. */
export async function embedMetadata(path: string, metadata: AssetMetadata): Promise<EmbeddingResult> {
  const prepared = await prepareEmbeddedMetadata(path, metadata);
  try {
    if (prepared.path) await rename(prepared.path, path);
    return prepared.result;
  } finally {
    await prepared.dispose();
  }
}

function textField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Embedded metadata also indexes media added by external tools, even before a sidecar exists. */
export async function readEmbeddedMetadata(path: string): Promise<AssetMetadata> {
  const tool = new ExifTool({ maxProcs: 1, taskTimeoutMillis: 15_000 });
  try {
    const tags = await tool.read(path);
    const subjects: unknown = tags.Subject ?? tags.Keywords;
    return {
      title: textField(tags.Title),
      description: textField(tags.Description) || textField(tags.Comment),
      tags: Array.isArray(subjects)
        ? subjects.filter((tag): tag is string => typeof tag === 'string')
        : typeof subjects === 'string'
          ? [subjects]
          : [],
    };
  } catch {
    return { title: '', description: '', tags: [] };
  } finally {
    await tool.end();
  }
}
