import type { AppState, Brand } from '../../domain/models';

/** An accepted workspace is newer than the home list cached before that open or edit. */
export function rememberBrand(state: AppState | null, brand: Brand): AppState | null {
  if (!state) return state;
  const { id, name, path, lastOpened } = brand;
  return {
    ...state,
    lastBrandId: id,
    brands: [...state.brands.filter((entry) => entry.id !== id), { id, name, path, lastOpened }].sort(
      (a, b) => b.lastOpened.localeCompare(a.lastOpened),
    ),
  };
}
