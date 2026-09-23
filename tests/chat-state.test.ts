import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatSession, ModelInfo } from '../src/domain/models';
import {
  applyMessage,
  mergeSession,
  seedDraft,
  selectedSession,
  validSelection,
} from '../src/renderer/features/chat/session-state';

const message: ChatMessage = {
  id: 'm1',
  role: 'assistant',
  text: 'Hello',
  turnId: 'turn',
  files: [],
  createdAt: '',
};
const session: ChatSession = {
  id: 's1',
  scope: { brandId: 'brand', videoId: null, clipId: null },
  topic: 'brand',
  title: 'Brand',
  threadId: 'thread',
  messages: [message],
  open: true,
  updatedAt: '',
};
describe('conversation state under streaming and refresh', () => {
  it('replaces snapshots without duplicates and appends actual deltas exactly once', () => {
    const snapshot = {
      type: 'chat',
      sessionId: session.id,
      message: { ...message, text: 'Hello world' },
      delta: false,
    } as const;
    const once = applyMessage(session.messages, snapshot);
    expect(applyMessage(once, snapshot)).toEqual(once);
    expect(
      applyMessage(once, { ...snapshot, message: { ...message, text: '!' }, delta: true })[0]?.text,
    ).toBe('Hello world!');
  });
  it('keeps newer streaming content when an older history load resolves', () => {
    const streamed = {
      ...session,
      messages: [
        { ...message, text: 'Hello world' },
        { ...message, id: 'm2', text: 'Second' },
      ],
    };
    expect(mergeSession(session, streamed).messages.map((entry) => entry.text)).toEqual([
      'Hello world',
      'Second',
    ]);
    expect(mergeSession(streamed, session).messages).toHaveLength(2);
  });
  it('preserves a manually selected tab on refreshed session lists', () => {
    const second = { ...session, id: 's2' };
    expect(selectedSession([session, second], 's2')).toBe('s2');
    expect(selectedSession([session, { ...second, open: false }], 's2')).toBe('s1');
  });
});
describe('composer configuration and prepared requests', () => {
  it('updates an untouched prepared request, while keeping a user-edited draft for explicit replacement', () => {
    expect(seedDraft({ text: 'Old upload', seed: 'Old upload', pending: null }, 'New upload').text).toBe(
      'New upload',
    );
    expect(seedDraft({ text: 'My edits', seed: 'Old upload', pending: null }, 'New upload')).toEqual({
      text: 'My edits',
      seed: 'New upload',
      pending: 'New upload',
    });
    expect(seedDraft({ text: '', seed: 'Already sent', pending: null }, 'Already sent').text).toBe('');
    expect(seedDraft({ text: 'Keep me', seed: 'Old', pending: null }, null).text).toBe('Keep me');
  });
  it('repairs stale saved model options using actual available capabilities', () => {
    const model: ModelInfo = {
      id: 'available',
      name: 'Available',
      description: '',
      reasoning: ['low', 'high'],
      defaultReasoning: 'high',
      fast: false,
      isDefault: true,
    };
    expect(validSelection({ model: 'retired', reasoning: 'ultra', fast: true }, [model])).toEqual({
      model: 'available',
      reasoning: 'high',
      fast: false,
    });
    expect(validSelection({ model: 'available', reasoning: 'low', fast: false }, [model]).reasoning).toBe(
      'low',
    );
  });
});
