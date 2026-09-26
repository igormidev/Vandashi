import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AppFault } from '../../domain/diagnostics';
import { githubFetch, type ReleaseArtifact, type UpdateFetch } from './github-release';

export async function verifyInstaller(path: string, asset: ReleaseArtifact['asset']): Promise<void> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== asset.size)
    throw new AppFault({ id: 'updateInvalid' });
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  if (hash.digest('base64') !== asset.sha512) throw new AppFault({ id: 'updateInvalid' });
}
export class InstallerDownload {
  private ready: { path: string; release: ReleaseArtifact } | null = null;
  constructor(
    private readonly directory: string,
    private readonly request: UpdateFetch = fetch,
  ) {}
  async download(release: ReleaseArtifact, progress: (value: number) => void): Promise<void> {
    this.ready = null;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const directory = await lstat(this.directory);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new AppFault({ id: 'updateInvalid' });
    const destination = join(this.directory, release.asset.name);
    try {
      await verifyInstaller(destination, release.asset);
      this.ready = { path: destination, release };
      return;
    } catch {
      /* Missing, interrupted or changed cache entries are never trusted. */
    }
    const temporary = join(this.directory, `${randomUUID()}.partial`);
    const file = await open(temporary, 'wx', 0o600);
    try {
      const response = await githubFetch(
        release.url,
        { signal: AbortSignal.timeout(30 * 60 * 1000) },
        this.request,
      );
      if (!response.ok || !response.body)
        throw new AppFault({ id: 'updateDownloadFailed' }, `HTTP ${String(response.status)}`);
      const reader = response.body.getReader();
      const hash = createHash('sha512');
      let received = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          received += value.length;
          if (received > release.asset.size) throw new AppFault({ id: 'updateInvalid' });
          hash.update(value);
          // FileHandle.write can be partial; finish each chunk before reporting progress.
          let offset = 0;
          while (offset < value.length) {
            const { bytesWritten } = await file.write(value, offset, value.length - offset);
            if (bytesWritten === 0) throw new AppFault({ id: 'updateDownloadFailed' });
            offset += bytesWritten;
          }
          progress((received / release.asset.size) * 100);
        }
      } finally {
        await reader.cancel();
      }
      if (received !== release.asset.size || hash.digest('base64') !== release.asset.sha512)
        throw new AppFault({ id: 'updateInvalid' });
      await file.sync();
      await file.close();
      await rename(temporary, destination);
      this.ready = { path: destination, release };
    } catch (error) {
      if (error instanceof AppFault) throw error;
      throw new AppFault(
        { id: 'updateDownloadFailed' },
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      await file.close();
      await rm(temporary, { force: true });
    }
  }
  async verifiedPath(version: string): Promise<string> {
    if (this.ready?.release.version !== version) throw new AppFault({ id: 'updateChanged' });
    try {
      await verifyInstaller(this.ready.path, this.ready.release.asset);
    } catch {
      throw new AppFault({ id: 'updateInvalid' });
    }
    return this.ready.path;
  }
}

/** Remove a rejected file from the upstream updater's existence-only in-process cache. */
export async function quarantineInstaller(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (!info.isFile() && !info.isSymbolicLink()) throw new AppFault({ id: 'updateInvalid' });
    await rename(path, `${path}.invalid-${randomUUID()}`);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
}
