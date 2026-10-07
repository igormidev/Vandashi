import { expect, test } from 'vitest';
import { messageCitationId } from '../src/renderer/features/chat/message-citation';

test('chat citations accept only bounded internal fragments and preserve exact encoded message identities', () => {
  const id = 'message [雪] / # and percent %';
  expect(messageCitationId(`#chat-message-${encodeURIComponent(id)}`)).toBe(id);
  for (const value of [
    'https://example.com/#chat-message-source',
    '/tmp/source.md',
    '#other-message-source',
    '#chat-message-',
    '#chat-message-%ZZ',
    '#chat-message-%00bad',
    '#chat-message-%1fbad',
    '#chat-message-%7fbad',
    `#chat-message-${'a'.repeat(513)}`,
  ]) {
    expect(messageCitationId(value)).toBeNull();
  }
});
