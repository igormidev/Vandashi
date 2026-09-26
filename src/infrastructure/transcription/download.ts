import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AppFault } from '../../domain/diagnostics';

export interface DownloadFile {
  url: string;
  size: number;
  sha256: string;
}

export async function digest(path: string, signal: AbortSignal): Promise<string> {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path, { signal })) hash.update(bytes as Buffer);
  signal.throwIfAborted();
  return hash.digest('hex');
}

export async function verifiedFile(
  path: string,
  file: Pick<DownloadFile, 'size' | 'sha256'>,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const info = await lstat(path);
    return (
      info.isFile() &&
      !info.isSymbolicLink() &&
      info.size === file.size &&
      (await digest(path, signal)) === file.sha256
    );
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function downloadFile(
  path: string,
  file: DownloadFile,
  signal: AbortSignal,
  progress: (fraction: number) => void,
): Promise<void> {
  if (await verifiedFile(path, file, signal)) return;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.partial`;
  try {
    const response = await fetch(file.url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(1_800_000)]),
    });
    if (!response.ok || !response.body)
      throw new AppFault({ id: 'appTranscriptionSetupFailed' }, `HTTP ${String(response.status)}`);
    const handle = await open(temporary, 'wx', 0o600);
    const hash = createHash('sha256');
    let received = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        signal.throwIfAborted();
        received += value.byteLength;
        if (received > file.size) throw new AppFault({ id: 'appTranscriptionSetupFailed' });
        hash.update(value);
        let offset = 0;
        while (offset < value.byteLength) {
          const result = await handle.write(value, offset, value.byteLength - offset);
          if (result.bytesWritten <= 0) throw new AppFault({ id: 'appTranscriptionSetupFailed' });
          offset += result.bytesWritten;
        }
        progress(received / file.size);
      }
      if (received !== file.size || hash.digest('hex') !== file.sha256)
        throw new AppFault({ id: 'appTranscriptionSetupFailed' });
      await handle.sync();
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      await handle.close();
    }
    signal.throwIfAborted();
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
