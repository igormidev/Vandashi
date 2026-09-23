import { describe, expect, it } from 'vitest';
import { parseInvocation } from '../src/desktop/validation';
import { packagingSchema } from '../src/infrastructure/storage/schemas';
import type { Packaging } from '../src/domain/models';

const scope = { brandId: 'brand', videoId: 'video', clipId: null };
const packaging: Packaging = {
  titles: { long: ['Reviewed title'], short: ['Short title'] },
  descriptions: { long: '', short: '' },
  tags: { long: [], short: [] },
  thumbnails: Array.from({ length: 1001 }, (_, index) => `/video/thumbnails/candidate-${String(index)}.png`),
  theme: '',
};

function requests(value: Packaging) {
  return [
    {
      method: 'saveWorkspace',
      input: {
        scope,
        revision: 'reviewed-source',
        documents: [],
        brandConfig: null,
        packaging: value,
        commit: { title: 'Review packaging', body: 'Keep every ordered thumbnail candidate.' },
      },
    },
    {
      method: 'preparePublish',
      input: { scope, platform: 'youtube', browser: 'Chrome', packaging: value, clipId: null },
    },
  ];
}

describe('large thumbnail libraries at the desktop boundary', () => {
  it('retains every stored candidate in reviewed order when saving or preparing publication', () => {
    const edited = packagingSchema.parse({
      ...packaging,
      titles: { ...packaging.titles, long: ['A revised title'] },
      thumbnails: [...packaging.thumbnails].reverse(),
    });
    for (const { method, input } of requests(edited)) {
      const result = parseInvocation(method, [input]);
      expect(result.args).toEqual([input]);
    }
  });

  it('still rejects unsafe paths and oversized IPC envelopes without imposing a 500-item limit', () => {
    for (const { method, input } of requests({ ...packaging, thumbnails: ['/video/unsafe\0.png'] }))
      expect(() => parseInvocation(method, [input])).toThrow('Invalid operation arguments');
    for (const { method, input } of requests({
      ...packaging,
      thumbnails: Array.from({ length: 20_001 }, () => '/video/thumbnail.png'),
    }))
      expect(() => parseInvocation(method, [input])).toThrow('too large');
  });
});
