import { describe, expect, it } from 'vitest';
import type { Asset } from '../src/domain/models';
import { filterAssets, indexAssets, parseAssetTags } from '../src/renderer/features/assets/asset-index';

function asset(id: string, path: string, fields: Partial<Asset> = {}): Asset {
  return {
    id,
    path: `/root/${path}`,
    relativePath: path,
    title: id,
    description: '',
    tags: [],
    kind: 'image',
    size: 100,
    hash: id,
    shared: false,
    mediaUrl: `media://${id}`,
    ...fields,
  };
}

describe('asset library index', () => {
  const items = [
    asset('city', 'video_assets/footage/city.png', {
      description: 'São Paulo from above',
      tags: ['city', 'background'],
    }),
    asset('street', 'video_assets/footage/night/street.mp4', {
      kind: 'video',
      description: 'Empty street at midnight',
    }),
    asset('music', 'video_assets/score.mp3', { kind: 'audio', tags: ['background'] }),
    asset('logo', 'shared_assets/logos/logo.png', { shared: true }),
  ];
  const index = indexAssets(items);
  const filters = {
    query: '',
    folder: '',
    kinds: ['image', 'video', 'audio', 'other'] as Asset['kind'][],
    tag: '',
  };

  it('shows folders only one level deep and never duplicates a nested file at the root', () => {
    const root = filterAssets(index, filters);
    expect(root.assets.map((item) => item.id)).toEqual(['music']);
    expect(root.folders).toEqual(['footage', 'logos']);
    const nested = filterAssets(index, { ...filters, folder: 'footage' });
    expect(nested.assets.map((item) => item.id)).toEqual(['city']);
    expect(nested.folders).toEqual(['footage/night']);
  });

  it('searches normalized descriptions recursively and intersects every search term', () => {
    expect(
      filterAssets(index, { ...filters, folder: 'logos', query: 'sao ABOVE' }).assets.map((item) => item.id),
    ).toEqual(['city']);
    expect(
      filterAssets(index, { ...filters, query: 'street midnight' }).assets.map((item) => item.id),
    ).toEqual(['street']);
    expect(filterAssets(index, { ...filters, query: 'street city' }).assets).toEqual([]);
  });

  it('combines tags and media kinds without hiding nested tag matches', () => {
    expect(index.tags).toEqual(['background', 'city']);
    const found = filterAssets(index, { ...filters, tag: 'background', kinds: ['image'] });
    expect(found.assets.map((item) => item.id)).toEqual(['city']);
    expect(found.folders).toEqual([]);
    expect(filterAssets(index, { ...filters, kinds: [] }).assets).toEqual([]);
  });

  it('normalizes imported Windows paths and cleans repeated tag input', () => {
    expect(indexAssets([asset('windows', 'video_assets\\nature\\forest.png')]).entries[0]?.parent).toBe(
      'nature',
    );
    expect(parseAssetTags(' #nature, nature, , ##night, landscape ')).toEqual([
      'nature',
      'night',
      'landscape',
    ]);
  });
});
