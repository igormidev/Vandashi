import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheDraft, readDraft } from '../src/renderer/features/chat/draft-cache';
import { seedDraft } from '../src/renderer/features/chat/session-state';
import type { ClipHandoff } from '../src/domain/models';

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

  const handoff: ClipHandoff = {
    message: { id: 'clipHandoff', params: { ratio: '9:16', start: 0, end: 30 } },
    guidance: 'Keep 手書き and literal {{start}} unchanged.\n',
  };

  it('retains typed seed ownership and verbatim guidance through tab switches and cache restoration', () => {
    const draft = seedDraft({ text: '', seed: null, pending: null }, 'Localized instruction', handoff);
    cacheDraft('clip', seedDraft(draft, null), 'edit');
    expect(readDraft('clip', null).draft).toEqual(draft);
    expect(readDraft('clip', 'Localized instruction').draft).toEqual(draft);
    expect(readDraft('clip', null).draft.handoff?.guidance).toBe(handoff.guidance);
  });

  it('keeps edited user content apart from its pending owned instruction and resets ownership for a new plain seed', () => {
    const edited = {
      ...seedDraft({ text: '', seed: null, pending: null }, 'Owned instruction', handoff),
      text: 'My revised user request',
    };
    cacheDraft('clip', edited, 'read');
    const restored = readDraft('clip', null).draft;
    expect(restored.text).not.toBe(restored.seed);
    expect(restored.handoff).toEqual(handoff);
    const replacement = seedDraft(restored, 'Another ordinary prepared request');
    expect(replacement.handoff).toBeUndefined();
    expect(replacement.text).toBe(edited.text);
    expect(replacement.pending).toBe('Another ordinary prepared request');
  });

  it.each([
    { message: { id: 'scriptHandoff' }, guidance: 'Wrong app message' },
    { ...handoff, message: { id: 'clipHandoff', params: { ratio: '16:9', start: 0, end: 30 } } },
    { ...handoff, message: { id: 'clipHandoff', params: { ratio: '9:16', start: 30, end: 0 } } },
    { ...handoff, message: { id: 'clipHandoff', params: { ratio: '9:16', start: '0', end: 30 } } },
  ])('restores a draft without trusting a malformed cached handoff: %j', (invalid) => {
    entries.set(
      'vandashi.draft.clip',
      JSON.stringify({ text: 'Retain my text', seed: 'Owned instruction', mode: 'edit', handoff: invalid }),
    );
    const restored = readDraft('clip', null).draft;
    expect(restored.text).toBe('Retain my text');
    expect(restored.handoff).toBeUndefined();
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
