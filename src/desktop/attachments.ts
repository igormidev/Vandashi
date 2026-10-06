import { nativeImage } from 'electron';
import { AppFault } from '../domain/diagnostics';
import { savePastedImage } from '../infrastructure/pasted-images';

/** Paste events supply image bytes, never a clipboard-read capability or an arbitrary output path. */
export async function storePastedImage(base64: string, root: string): Promise<string> {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 4_000_000 || bytes.toString('base64') !== base64)
    throw new AppFault({ id: 'desktopPreviewInvalid' });
  const image = nativeImage.createFromBuffer(bytes);
  const size = image.getSize();
  if (image.isEmpty() || size.width * size.height > 25_000_000)
    throw new AppFault({ id: 'desktopPreviewInvalid' });
  return savePastedImage(image.toPNG(), root);
}
