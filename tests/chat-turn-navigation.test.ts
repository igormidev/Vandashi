import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../src/domain/models';
import {
  chatTurnSummaries,
  filterChatTurns,
  turnAtRow,
  turnPreview,
} from '../src/renderer/features/chat/turn-navigation';

function message(id: string, role: ChatMessage['role'], text: string, turnId: string | null): ChatMessage {
  return { id, role, text, turnId, files: [], createdAt: '' };
}

describe('Conversation turn navigation', () => {
  it('indexes only accepted provider turns and keeps answer ownership across optimistic boundaries', () => {
    const messages: ChatMessage[] = [
      message('orphan', 'assistant', 'No accepted user', 'old'),
      { ...message('first 雪 [id]', 'user', 'Automatic wrapper', 'one'), userText: 'My raw guidance' },
      message('commentary', 'assistant', 'Checking guides', 'one'),
      message('answer', 'assistant', 'First answer', 'one'),
      { ...message('progress', 'assistant', 'Working commentary', 'one'), phase: 'commentary' },
      message('replacement', 'assistant', 'Latest complete answer', 'one'),
      { ...message('queued', 'user', 'Not accepted yet', null), pending: 'queued' },
      message('after-queue', 'assistant', 'Cannot attach across queue boundary', 'one'),
      { ...message('sending', 'user', 'Awaiting acceptance', 'two'), pending: 'sending' },
      message('unverified', 'user', 'No provider turn', null),
      message('second', 'user', 'Second accepted guidance', 'two'),
      message('foreign', 'assistant', 'Wrong turn answer', 'one'),
      message('second-answer', 'assistant', 'Correct second answer', 'two'),
      message('tool', 'tool', 'Raw tool output', 'two'),
    ];
    messages.forEach(Object.freeze);
    const before = structuredClone(messages);
    const turns = chatTurnSummaries(messages);
    expect(turns).toEqual([
      {
        messageId: 'first 雪 [id]',
        messageIndex: 1,
        turnId: 'one',
        number: 1,
        userText: 'My raw guidance',
        assistantText: 'Latest complete answer',
      },
      {
        messageId: 'second',
        messageIndex: 10,
        turnId: 'two',
        number: 2,
        userText: 'Second accepted guidance',
        assistantText: 'Correct second answer',
      },
    ]);
    expect(messages).toEqual(before);
  });

  it('searches full user and final-answer text literally across fields and beyond the rendered preview', () => {
    const messages = [
      message('user', 'user', 'A Unicode 雪 request with [.*]', 'one'),
      message('answer', 'assistant', `${'Long visible passage '.repeat(40)}hidden needle <img src=x>`, 'one'),
      message('other', 'user', 'Snow elsewhere', 'two'),
      message('other-answer', 'assistant', 'Visible needle', 'two'),
    ];
    const turns = chatTurnSummaries(messages);
    expect(filterChatTurns(turns, '雪 HIDDEN <img [.*]').map((entry) => entry.messageId)).toEqual(['user']);
    expect(filterChatTurns(turns, 'A Unicode absent')).toEqual([]);
    expect(filterChatTurns(turns, ' \n\t ')).toEqual(turns);
    expect(turnPreview(turns[0]?.assistantText ?? '')).not.toContain('hidden needle');
    expect(turnPreview(' a\n\n b\t c ')).toBe('a b c');
  });

  it('maps tool or answer rows to their accepted turn without inventing ownership for pending or missing rows', () => {
    const messages = [
      message('first', 'user', 'First', 'one'),
      message('work', 'tool', 'Tools', 'one'),
      message('second', 'user', 'Second', 'two'),
      message('answer', 'assistant', 'Second answer', 'two'),
      { ...message('queued', 'user', 'Queued', null), pending: 'queued' as const },
      message('unowned', 'assistant', 'Old turn snapshot after queued boundary', 'one'),
      message('same-unowned', 'assistant', 'Latest turn snapshot after queued boundary', 'two'),
    ];
    const turns = chatTurnSummaries(messages);
    expect(turnAtRow(turns, messages, 'work')).toBe('first');
    expect(turnAtRow(turns, messages, 'answer')).toBe('second');
    expect(turnAtRow(turns, messages, 'queued')).toBeNull();
    expect(turnAtRow(turns, messages, 'unowned')).toBeNull();
    expect(turnAtRow(turns, messages, 'same-unowned')).toBeNull();
    expect(turnAtRow(turns, messages, 'missing')).toBeNull();
    expect(turnAtRow(turns, messages, null)).toBeNull();
  });

  it('keeps distant turns available for search without truncating source history or raw previews', () => {
    const messages = Array.from({ length: 205 }, (_, index) => [
      message(`user-${String(index)}`, 'user', `Request ${String(index)}`, `turn-${String(index)}`),
      message(`answer-${String(index)}`, 'assistant', `Answer ${String(index)}`, `turn-${String(index)}`),
    ]).flat();
    const turns = chatTurnSummaries(messages);
    expect(turns).toHaveLength(205);
    expect(filterChatTurns(turns, 'Request 204 Answer').map((turn) => turn.messageId)).toEqual(['user-204']);
    expect(turnAtRow(turns, messages, 'answer-204')).toBe('user-204');
    expect(turns[204]?.number).toBe(205);
    expect(messages).toHaveLength(410);
  });
});
