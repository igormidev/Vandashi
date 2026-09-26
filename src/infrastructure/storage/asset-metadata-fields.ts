import { lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AppFault } from '../../domain/diagnostics';
import type { AssetAnalysis } from '../../domain/transcription';
import { containedPath } from './files';

export function cleanTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().replace(/^#+/u, '')).filter(Boolean))];
}

export function analysisTags(tags: string[], analysis?: AssetAnalysis): string[] {
  const clean = cleanTags(tags);
  if (!analysis) return clean;
  return [
    ...clean.filter((tag) => !['audio:dialog', 'audio:music', 'audio:sound-effect'].includes(tag)),
    `audio:${analysis.category}`,
  ];
}

/** Direct writes cannot follow even an in-root symlink to a different asset. */
export async function checkedAssetPath(root: string, path: string): Promise<string> {
  const safe = await containedPath(root, path);
  const boundary = resolve(root);
  let ancestor = safe;
  for (;;) {
    const info = await lstat(ancestor);
    if (info.isSymbolicLink()) throw new AppFault({ id: 'storageSymlinkOutside' });
    if (ancestor === boundary) break;
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new AppFault({ id: 'storagePathOutside' });
    ancestor = parent;
  }
  if (!(await lstat(safe)).isFile()) throw new AppFault({ id: 'storageMediaFileRequired' });
  return safe;
}
