import { expect, it } from 'vitest';
import { relativeMessageTime } from '../src/renderer/features/chat/message-time';

const origin = '2026-10-08T12:00:00Z';
const timestamp = Date.parse(origin);

it('relative message time preserves unknown dates and clocks rather than inventing elapsed time', () => {
  for (const value of ['', 'not a date']) expect(relativeMessageTime(value, timestamp, 'en')).toBeNull();
  for (const now of [NaN, Infinity]) expect(relativeMessageTime(origin, now, 'en')).toBeNull();
});

it('relative message time floors minute boundaries and never displays seconds', () => {
  expect(relativeMessageTime(origin, timestamp + 59_999, 'en')).toEqual({ kind: 'now', time: '' });
  expect(relativeMessageTime(origin, timestamp + 60_000, 'en')).toEqual({ kind: 'ago', time: '1m' });
  expect(relativeMessageTime(origin, timestamp + 3_600_000, 'en')).toEqual({ kind: 'ago', time: '1h' });
  expect(relativeMessageTime(origin, timestamp + 86_400_000, 'en')).toEqual({ kind: 'ago', time: '1d' });
});

it('relative message time includes days and nonzero hour/minute parts with natural conjunctions', () => {
  expect(relativeMessageTime(origin, timestamp + (2 * 1440 + 3 * 60 + 38) * 60_000 + 59_999, 'en')).toEqual({
    kind: 'ago',
    time: '2d, 3h, and 38m',
  });
  expect(relativeMessageTime(origin, timestamp + (3 * 60 + 38) * 60_000, 'en')).toEqual({
    kind: 'ago',
    time: '3h and 38m',
  });
});

it('relative message time handles future timestamps honestly and formats the active locale', () => {
  expect(relativeMessageTime(origin, timestamp - 120_000, 'en')).toEqual({ kind: 'future', time: '2m' });
  expect(relativeMessageTime(origin, timestamp + 90 * 60_000, 'pt-BR')).toEqual({
    kind: 'ago',
    time: '1 h e 30 min',
  });
});
