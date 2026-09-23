import type { Asset, AssetKind } from '../../../domain/models';

export interface IndexedAsset {
  asset: Asset;
  path: string;
  parent: string;
  search: string;
}
export interface AssetIndex {
  entries: IndexedAsset[];
  tags: string[];
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}

export function indexAssets(assets: Asset[]): AssetIndex {
  const tags = new Set<string>();
  const entries = assets.map((asset) => {
    asset.tags.forEach((tag) => tags.add(tag));
    const path = asset.relativePath
      .replaceAll('\\', '/')
      .replace(/^(?:video_assets|shared_assets|assets)\//, '');
    const separator = path.lastIndexOf('/');
    return {
      asset,
      path,
      parent: separator < 0 ? '' : path.slice(0, separator),
      search: normalizeSearch([asset.title, asset.description, path, ...asset.tags].join(' ')),
    };
  });
  return { entries, tags: [...tags].sort((left, right) => left.localeCompare(right)) };
}

export function filterAssets(
  index: AssetIndex,
  options: { query: string; folder: string; kinds: AssetKind[]; tag: string },
): { assets: Asset[]; folders: string[] } {
  const query = normalizeSearch(options.query.trim());
  const terms = query.split(/\s+/).filter(Boolean);
  const matched = index.entries.filter(
    (entry) =>
      options.kinds.includes(entry.asset.kind) &&
      (!options.tag || entry.asset.tags.includes(options.tag)) &&
      terms.every((term) => entry.search.includes(term)),
  );
  if (query || options.tag) return { assets: matched.map((entry) => entry.asset), folders: [] };
  const prefix = options.folder ? `${options.folder}/` : '';
  const folders = new Set<string>();
  for (const entry of matched) {
    if (!entry.path.startsWith(prefix)) continue;
    const rest = entry.path.slice(prefix.length);
    const separator = rest.indexOf('/');
    if (separator >= 0) folders.add(`${prefix}${rest.slice(0, separator)}`);
  }
  return {
    assets: matched.filter((entry) => entry.parent === options.folder).map((entry) => entry.asset),
    folders: [...folders].sort((left, right) => left.localeCompare(right)),
  };
}

export function parseAssetTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim().replace(/^#+/, ''))
        .filter(Boolean),
    ),
  ];
}

export function fallbackAssetKind(path: string): AssetKind {
  const extension = path.split('.').at(-1)?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'bmp', 'tiff'].includes(extension)) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(extension)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'aiff'].includes(extension)) return 'audio';
  return 'other';
}
