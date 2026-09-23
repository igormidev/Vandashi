import { AppFault } from '../../domain/diagnostics';
import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import { lstat, open, readFile } from 'node:fs/promises';
import { extname, isAbsolute } from 'node:path';
import { atomicWrite, containedPath, errorCode } from './files';
import type { WriteReceipt } from './files';

const maximumImageBytes = 50 * 1024 * 1024;
const sameFile = (before: Stats, after: Stats) =>
  after.isFile() &&
  before.dev === after.dev &&
  before.ino === after.ino &&
  before.size === after.size &&
  before.mtimeMs === after.mtimeMs &&
  before.ctimeMs === after.ctimeMs;

/** Bind workspace revisions to contained image bytes, including uncommitted AI edits. */
export async function brandImageRevision(identity: string, selected: string): Promise<string | null> {
  if (!selected) return null;
  const path = await containedPath(identity, selected);
  let initial: Stats;
  try {
    initial = await lstat(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
  if (!initial.isFile() || initial.size > maximumImageBytes)
    throw new AppFault({ id: 'storageBrandImageSize' });
  const handle = await open(path, 'r');
  try {
    if (!sameFile(initial, await handle.stat())) throw new AppFault({ id: 'storageWorkspaceConflict' });
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    let total = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > maximumImageBytes) throw new AppFault({ id: 'storageBrandImageSize' });
      hash.update(buffer.subarray(0, bytesRead));
    }
    await containedPath(identity, selected);
    if (
      total !== initial.size ||
      !sameFile(initial, await handle.stat()) ||
      !sameFile(initial, await lstat(path))
    )
      throw new AppFault({ id: 'storageWorkspaceConflict' });
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

/** Native IPC authorizes absolute picker paths before this persistence boundary. */
export async function saveBrandImage(
  identity: string,
  selected: string,
  receipt?: WriteReceipt,
): Promise<string> {
  if (!selected) return '';
  const extension = extname(selected).toLowerCase();
  if (
    !['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.bmp', '.tif', '.tiff'].includes(extension)
  )
    throw new AppFault({ id: 'storageBrandImageRequired' });
  if (!isAbsolute(selected)) {
    const existing = await containedPath(identity, selected);
    if (!(await lstat(existing)).isFile()) throw new AppFault({ id: 'storageBrandImageUnavailable' });
    return selected;
  }
  const stat = await lstat(selected);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumImageBytes)
    throw new AppFault({ id: 'storageBrandImageSize' });
  const name = `brand_icon${extension}`;
  await atomicWrite(await containedPath(identity, name), await readFile(selected), receipt);
  return name;
}
