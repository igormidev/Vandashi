import { seedDraft, type Draft } from './session-state';
import { parseClipHandoff } from '../../../domain/clip-handoff';
import type { ClipHandoff } from '../../../domain/models';

export function readChatFontSize(): number {
  try {
    const stored = Number(localStorage.getItem('vandashi.chatFontSize'));
    return Number.isInteger(stored) && stored >= 10 && stored <= 22 ? stored : 12;
  } catch {
    return 12;
  }
}
export function cacheChatFontSize(size: number): void {
  try {
    localStorage.setItem('vandashi.chatFontSize', String(size));
  } catch {
    /* Keep the active size when storage is full. */
  }
}

interface SavedDraft {
  draft: Draft;
  mode: 'read' | 'edit';
  collaboration: 'default' | 'plan';
  attachments: string[];
}
export function readDraft(id: string, seed: string | null, handoff?: ClipHandoff): SavedDraft {
  const fallback: SavedDraft = {
    draft: { text: seed ?? '', seed, pending: null, ...(handoff ? { handoff } : {}) },
    mode: 'edit',
    collaboration: 'default',
    attachments: [],
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
      collaboration:
        'collaboration' in value && value.collaboration === 'plan' && !restoredHandoff ? 'plan' : 'default',
      // This restores selection only. Every preview and send still needs native authorization.
      attachments:
        'attachments' in value && Array.isArray(value.attachments)
          ? [
              ...new Set(
                value.attachments.filter(
                  (path: unknown): path is string => typeof path === 'string' && path.length < 4096,
                ),
              ),
            ].slice(0, 50)
          : [],
    };
  } catch {
    return fallback;
  }
}
export function cacheDraft(
  id: string,
  draft: Draft,
  mode: 'read' | 'edit',
  attachments: string[] = [],
  collaboration: 'default' | 'plan' = 'default',
): void {
  try {
    localStorage.setItem(
      `vandashi.draft.${id}`,
      JSON.stringify({
        text: draft.text,
        seed: draft.seed,
        pending: draft.pending,
        mode,
        collaboration,
        attachments,
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
