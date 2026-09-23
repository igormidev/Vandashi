import { AppFault } from '../../domain/diagnostics';
import { lstat, readFile } from 'node:fs/promises';
import { extname, isAbsolute } from 'node:path';
import { atomicWrite, containedPath } from './files';

/** Native IPC authorizes absolute picker paths before this persistence boundary. */
export async function saveBrandImage(identity: string, selected: string): Promise<string> {
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
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 50 * 1024 * 1024)
    throw new AppFault({ id: 'storageBrandImageSize' });
  const name = `brand_icon${extension}`;
  await atomicWrite(await containedPath(identity, name), await readFile(selected));
  return name;
}
