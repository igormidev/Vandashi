import { seedDraft, type Draft } from './session-state';

interface SavedDraft {
  draft: Draft;
  mode: 'read' | 'edit';
}
export function readDraft(id: string, seed: string | null): SavedDraft {
  const fallback: SavedDraft = { draft: { text: seed ?? '', seed, pending: null }, mode: 'edit' };
  try {
    const stored = localStorage.getItem(`vandashi.draft.${id}`);
    if (!stored) return fallback;
    const value: unknown = JSON.parse(stored);
    if (
      !value ||
      typeof value !== 'object' ||
      !('text' in value) ||
      typeof value.text !== 'string' ||
      !('seed' in value) ||
      (value.seed !== null && typeof value.seed !== 'string')
    )
      return fallback;
    return {
      draft: seedDraft({ text: value.text, seed: value.seed, pending: null }, seed),
      mode: 'mode' in value && value.mode === 'read' ? 'read' : 'edit',
    };
  } catch {
    return fallback;
  }
}
export function cacheDraft(id: string, draft: Draft, mode: 'read' | 'edit'): void {
  try {
    localStorage.setItem(
      `vandashi.draft.${id}`,
      JSON.stringify({ text: draft.text, seed: draft.seed, mode }),
    );
  } catch {
    /* A full preferences store must not interrupt typing. */
  }
}
export function cachedSelection(scope: string): string | null {
  try {
    return localStorage.getItem(`vandashi.selectedChat.${scope}`);
  } catch {
    return null;
  }
}
export function cacheSelection(scope: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(`vandashi.selectedChat.${scope}`, id);
    else localStorage.removeItem(`vandashi.selectedChat.${scope}`);
  } catch {
    /* Keep the current selection in memory when preferences are unavailable. */
  }
}

export function clearDraft(id: string): void {
  try {
    localStorage.removeItem(`vandashi.draft.${id}`);
  } catch {
    /* Reset the in-memory editor even if preferences are unavailable. */
  }
}
