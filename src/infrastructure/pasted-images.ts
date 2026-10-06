import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, lstat, realpath, open } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { AppFault } from '../domain/diagnostics';
import { errorCode } from './storage/files';

const limit = 25_000_000;
const namePattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.png$/u;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Native ownership applies to one normalized image, never its enclosing directory. */
export async function savePastedImage(bytes: Buffer, root: string): Promise<string> {
  if (bytes.length > limit) throw new AppFault({ id: 'desktopRequestTooLarge' });
  await mkdir(root, { recursive: true });
  if ((await lstat(root)).isSymbolicLink()) throw new AppFault({ id: 'storageSymlinkOutside' });
  const canonical = await realpath(root);
  const name = `${randomUUID()}.png`;
  const path = join(canonical, name);
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  await writeFile(
    path + '.owned.json',
    JSON.stringify({ format: 'vandashi-paste-v1', name, bytes: bytes.length, sha256: digest(bytes) }),
    { flag: 'wx', mode: 0o600 },
  );
  return path;
}

async function boundedBytes(path: string, maximum: number): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maximum) throw new AppFault({ id: 'desktopPreviewInvalid' });
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await handle.stat();
    if (
      length !== before.size ||
      after.size !== length ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw new AppFault({ id: 'desktopSelectedLocationChanged' });
    return bytes.subarray(0, length);
  } finally {
    await handle.close();
  }
}

export async function ownedPastedImage(value: string, root: string): Promise<string | null> {
  if (!namePattern.test(basename(value))) return null;
  try {
    if ((await lstat(root)).isSymbolicLink()) throw new AppFault({ id: 'storageSymlinkOutside' });
    const canonical = await realpath(root);
    if (![resolve(root), canonical].includes(dirname(resolve(value)))) return null;
    const path = join(canonical, basename(value));
    if ((await realpath(path)) !== path || (await lstat(path)).isSymbolicLink())
      throw new AppFault({ id: 'storageSymlinkOutside' });
    const record: unknown = JSON.parse((await boundedBytes(path + '.owned.json', 2048)).toString('utf8'));
    const bytes = await boundedBytes(path, limit);
    if (
      !record ||
      typeof record !== 'object' ||
      !('format' in record) ||
      record.format !== 'vandashi-paste-v1' ||
      !('name' in record) ||
      record.name !== basename(path) ||
      !('bytes' in record) ||
      record.bytes !== bytes.length ||
      !('sha256' in record) ||
      record.sha256 !== digest(bytes)
    )
      throw new AppFault({ id: 'desktopPreviewInvalid' });
    return path;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    if (error instanceof AppFault) throw error;
    throw new AppFault({ id: 'desktopPreviewInvalid' });
  }
}
