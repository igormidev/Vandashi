import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { extname } from 'node:path';
import { assetKind } from '../domain/asset-kind';
import { AppFault } from '../domain/diagnostics';
import type { FilePreview } from '../domain/file-preview';

/** A bounded preview of a host-authorized regular file; active HTML is always plain text. */
export async function readFilePreview(path: string, mediaUrl: string): Promise<FilePreview> {
  const kind = assetKind(path);
  if (kind !== 'other') return { kind, url: mediaUrl };
  const extension = extname(path).toLowerCase();
  const pdf = extension === '.pdf';
  const text = [
    '.md',
    '.markdown',
    '.jsx',
    '.txt',
    '.json',
    '.yaml',
    '.yml',
    '.csv',
    '.srt',
    '.vtt',
    '.html',
    '.css',
    '.js',
    '.ts',
    '.tsx',
    '.xml',
    '.log',
    '.toml',
    '.svg',
  ].includes(extension);
  if (!pdf && !text) return { kind: 'other' };
  const selected = await lstat(path);
  if (!selected.isFile() || selected.isSymbolicLink())
    throw new AppFault({ id: 'desktopSelectedLocationChanged' });
  const noFollow = process.platform === 'win32' ? 0 : constants.O_NOFOLLOW;
  const handle = await open(path, constants.O_RDONLY | noFollow);
  try {
    const before = await handle.stat();
    if (
      before.dev !== selected.dev ||
      before.ino !== selected.ino ||
      before.size !== selected.size ||
      before.mtimeMs !== selected.mtimeMs ||
      before.ctimeMs !== selected.ctimeMs
    )
      throw new AppFault({ id: 'desktopSelectedLocationChanged' });
    const limit = pdf ? 25_000_000 : 2_000_000;
    if (!before.isFile() || before.size > limit) throw new AppFault({ id: 'desktopRequestTooLarge' });
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > limit) throw new AppFault({ id: 'desktopRequestTooLarge' });
    const bytes = buffer.subarray(0, length);
    const [after, current] = await Promise.all([handle.stat(), lstat(path)]);
    if (
      !current.isFile() ||
      current.isSymbolicLink() ||
      before.dev !== current.dev ||
      before.ino !== current.ino ||
      before.size !== length ||
      before.size !== after.size ||
      before.size !== current.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      before.mtimeMs !== current.mtimeMs ||
      before.ctimeMs !== current.ctimeMs
    )
      throw new AppFault({ id: 'desktopSelectedLocationChanged' });
    if (pdf && !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-')))
      throw new AppFault({ id: 'desktopPreviewInvalid' });
    if (text && bytes.includes(0)) return { kind: 'other' };
    return pdf
      ? { kind: 'pdf', base64: bytes.toString('base64') }
      : { kind: 'text', text: bytes.toString('utf8') };
  } finally {
    await handle.close();
  }
}
