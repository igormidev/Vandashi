import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheDraft, readDraft } from '../src/renderer/features/chat/draft-cache';
import { seedDraft } from '../src/renderer/features/chat/session-state';

describe('prepared request decisions across conversation navigation', () => {
  const entries = new Map<string, string>();
  beforeEach(() => {
    entries.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a pending decision when reselecting its tab and remounting with or without the target', () => {
    const pending = seedDraft(
      { text: 'My custom directions', seed: 'Old review', pending: null },
      'New review',
    );
    const reselected = seedDraft(pending, null);
    expect(reselected).toEqual(pending);
    cacheDraft('publish', reselected, 'read');
    for (const target of [null, 'New review'])
      expect(readDraft('publish', target)).toEqual({ draft: pending, mode: 'read' });
  });

  it('retains the custom draft while replacing an unresolved choice with the latest review', () => {
    cacheDraft(
      'publish',
      { text: 'My custom directions', seed: 'Old review', pending: 'Old review' },
      'edit',
    );
    expect(readDraft('publish', 'New review').draft).toEqual({
      text: 'My custom directions',
      seed: 'New review',
      pending: 'New review',
    });
  });

  it('does not ask again after an explicit decision unless the prepared request changes', () => {
    const chosen = { text: 'My custom directions', seed: 'Reviewed request', pending: null };
    cacheDraft('publish', seedDraft(chosen, null), 'edit');
    expect(readDraft('publish', null).draft).toEqual(chosen);
    expect(readDraft('publish', 'Reviewed request').draft).toEqual(chosen);
    expect(readDraft('publish', 'Changed request').draft.pending).toBe('Changed request');
  });

  it('continues to restore older drafts while applying a new request conflict', () => {
    entries.set(
      'vandashi.draft.publish',
      JSON.stringify({ text: 'Legacy draft', seed: 'Old', mode: 'read' }),
    );
    expect(readDraft('publish', 'New')).toEqual({
      draft: { text: 'Legacy draft', seed: 'New', pending: 'New' },
      mode: 'read',
    });
  });
});
