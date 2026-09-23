import { seedDraft, type Draft } from './session-state';
import { parseClipHandoff } from '../../../domain/clip-handoff';
import type { ClipHandoff } from '../../../domain/models';

interface SavedDraft {
  draft: Draft;
  mode: 'read' | 'edit';
}
export function readDraft(id: string, seed: string | null, handoff?: ClipHandoff): SavedDraft {
  const fallback: SavedDraft = {
    draft: { text: seed ?? '', seed, pending: null, ...(handoff ? { handoff } : {}) },
    mode: 'edit',
  };
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
      (value.seed !== null && typeof value.seed !== 'string') ||
      ('pending' in value && value.pending !== null && typeof value.pending !== 'string')
    )
      return fallback;
    const restoredHandoff = 'handoff' in value ? parseClipHandoff(value.handoff) : undefined;
    return {
      draft: seedDraft(
        {
          text: value.text,
          seed: value.seed,
          pending: 'pending' in value && typeof value.pending === 'string' ? value.pending : null,
          ...(restoredHandoff ? { handoff: restoredHandoff } : {}),
        },
        seed,
        handoff,
      ),
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
      JSON.stringify({
        text: draft.text,
        seed: draft.seed,
        pending: draft.pending,
        mode,
        ...(draft.handoff ? { handoff: draft.handoff } : {}),
      }),
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
