import type { AssetKind } from './models';

/** Classification by supported container extension; adapters still probe and validate media bytes. */
export function assetKind(path: string): AssetKind {
  const extension = /\.[^./\\]+$/u.exec(path)?.[0].toLowerCase() ?? '';
  if (
    ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.bmp', '.tif', '.tiff'].includes(extension)
  )
    return 'image';
  if (['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'].includes(extension)) return 'video';
  if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.aiff', '.aif', '.opus', '.wma'].includes(extension))
    return 'audio';
  return 'other';
}
