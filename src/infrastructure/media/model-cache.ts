import { AppFault } from '../../domain/diagnostics';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import model from './speech-model.json';

export interface ModelFile {
  path: string;
  size: number;
  sha256: string;
}
export interface SpeechModel {
  id: string;
  revision: string;
  files: ModelFile[];
}
export const speechModel: SpeechModel = model;

async function validFile(path: string, file: ModelFile, signal: AbortSignal): Promise<boolean> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size !== file.size) return false;
    const hash = createHash('sha256');
    for await (const data of createReadStream(path, { signal })) hash.update(data as Buffer);
    return hash.digest('hex') === file.sha256;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Only these revision-pinned files are downloaded, verified before atomic publication. */
export async function ensureSpeechModel(
  cache: string,
  signal: AbortSignal,
  progress: (fraction: number) => void,
  manifest: SpeechModel = speechModel,
  download: typeof fetch = fetch,
): Promise<string> {
  const directory = join(cache, 'whisper-base-q8', manifest.revision);
  const total = manifest.files.reduce((sum, file) => sum + file.size, 0);
  let complete = 0;
  for (const file of manifest.files) {
    signal.throwIfAborted();
    if (!/^[a-zA-Z0-9_./-]+$/.test(file.path) || file.path.includes('..') || file.path.startsWith('/'))
      throw new AppFault({ id: 'mediaModelManifestInvalid' });
    const target = join(directory, file.path);
    if (await validFile(target, file, signal)) {
      complete += file.size;
      continue;
    }
    progress(complete / total);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.partial`;
    try {
      const response = await download(
        `https://huggingface.co/${manifest.id}/resolve/${manifest.revision}/${file.path}`,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]) },
      );
      if (!response.ok || !response.body)
        throw new AppFault({ id: 'mediaModelDownloadFailed', params: { status: response.status } });
      const reader = response.body.getReader();
      const hash = createHash('sha256');
      const handle = await open(temporary, 'wx', 0o600);
      let received = 0;
      try {
        let reading = true;
        while (reading) {
          const next = await reader.read();
          if (next.done) {
            reading = false;
            continue;
          }
          const chunk = next.value;
          signal.throwIfAborted();
          received += chunk.length;
          if (received > file.size) throw new AppFault({ id: 'mediaModelSizeInvalid' });
          hash.update(chunk);
          await handle.writeFile(chunk);
          progress((complete + received) / total);
        }
        if (received !== file.size || hash.digest('hex') !== file.sha256)
          throw new AppFault({ id: 'mediaModelChecksumInvalid' });
        await handle.sync();
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
        await handle.close();
      }
      signal.throwIfAborted();
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    complete += file.size;
  }
  return directory;
}
