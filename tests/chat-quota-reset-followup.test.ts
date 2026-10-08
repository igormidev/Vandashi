import { expect, it } from 'vitest';
import { quotaResetCountdown } from '../src/renderer/features/chat/quota-reset';

const now = Date.parse('2026-10-08T10:00:00Z');
const deadline = (minutes: number) => new Date(now + minutes * 60_000).toISOString();

it('keeps missing or invalid reset observations unavailable rather than inventing a zero countdown', () => {
  expect(quotaResetCountdown(null, now, 'en')).toBeNull();
  expect(quotaResetCountdown('not-a-provider-date', now, 'en')).toBeNull();
  expect(quotaResetCountdown(deadline(10), Number.NaN, 'en')).toBeNull();
});

it('rounds a future reset up to a whole minute and carries across hours and days', () => {
  expect(quotaResetCountdown(deadline(0.01), now, 'en')).toEqual({ minutesRemaining: 1, duration: '1 min' });
  expect(quotaResetCountdown(deadline(59.5), now, 'en')).toEqual({ minutesRemaining: 60, duration: '1 hr' });
  expect(quotaResetCountdown(deadline(1439.5), now, 'en')).toEqual({
    minutesRemaining: 1440,
    duration: '1 day',
  });
  expect(quotaResetCountdown(deadline(3064.1), now, 'en')).toEqual({
    minutesRemaining: 3065,
    duration: '2 days, 3 hr, 5 min',
  });
});

it('reports a reached deadline without counting below zero and recomputes from the current wall clock after suspension', () => {
  expect(quotaResetCountdown(deadline(5), now + 10 * 60_000, 'en')).toEqual({
    minutesRemaining: 0,
    duration: '0 min',
  });
  expect(quotaResetCountdown(deadline(5), now + 2 * 60_000, 'en')?.minutesRemaining).toBe(3);
  expect(quotaResetCountdown(deadline(5), now, 'en')?.minutesRemaining).toBe(5);
});

it('formats independent native deadlines in the selected locale without sharing a quota window', () => {
  const primary = quotaResetCountdown(deadline(63), now, 'pt-BR');
  const secondary = quotaResetCountdown(deadline(2940), now, 'ja');
  expect(primary).toEqual({ minutesRemaining: 63, duration: '1 h e 3 min' });
  expect(secondary).toEqual({ minutesRemaining: 2940, duration: '2 日 1 時間' });
});
