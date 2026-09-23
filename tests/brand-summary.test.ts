import { expect, it } from 'vitest';
import { rememberBrand } from '../src/renderer/app/brand-summary';
import { defaultSettings } from '../src/domain/defaults';
import type { AppState, Brand } from '../src/domain/models';

it('shows the latest opened name and orders Home by the accepted access time', () => {
  const state: AppState = {
    settings: defaultSettings,
    lastBrandId: 'recent',
    brands: [
      { id: 'recent', name: 'Recent brand', path: '/recent', lastOpened: '2026-09-22T00:00:00Z' },
      { id: 'old', name: 'Old name', path: '/old', lastOpened: '2026-09-20T00:00:00Z' },
    ],
  };
  const accepted: Brand = {
    id: 'old',
    name: 'New name',
    path: '/old',
    lastOpened: '2026-09-23T00:00:00Z',
    config: { name: 'New name', description: '', image: '', platforms: {} },
  };
  const updated = rememberBrand(state, accepted);
  expect(updated?.brands.map((entry) => entry.name)).toEqual(['New name', 'Recent brand']);
  expect(updated?.lastBrandId).toBe('old');
  expect(updated?.settings).toBe(state.settings);
  expect(state.brands[1]?.name).toBe('Old name');
  expect(updated?.brands[0]).not.toHaveProperty('config');
});
