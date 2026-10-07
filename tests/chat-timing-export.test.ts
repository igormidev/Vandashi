import { describe, expect, it } from 'vitest';
import { formatChatElapsed } from '../src/renderer/features/chat/chat-elapsed';
import { planMarkdownFilename } from '../src/renderer/features/chat/plan-export';

describe('Observed chat duration and browser plan exports', () => {
  it('formats elapsed time by flooring observed seconds, clamps invalid values and keeps units localized', () => {
    expect(formatChatElapsed(999, 'en')).toBe('0s');
    expect(formatChatElapsed(65_999, 'en')).toBe('1m 5s');
    expect(formatChatElapsed(3_605_000, 'en')).toBe('1h 0m 5s');
    expect(formatChatElapsed(-9000, 'en')).toBe('0s');
    expect(formatChatElapsed(Number.NaN, 'en')).toBe('0s');
    expect(formatChatElapsed(Number.POSITIVE_INFINITY, 'en')).toBe('0s');
    expect(formatChatElapsed(5000, 'ja')).toBe('5s');
  });

  it('keeps natural plan titles while preventing path components, hidden filenames and cross-platform device names', () => {
    expect(planMarkdownFilename('Revisar o roteiro', 'Plano proposto')).toBe('Revisar o roteiro.md');
    expect(planMarkdownFilename('README.MD', 'Proposed plan')).toBe('README.md');
    expect(planMarkdownFilename('../../outside\n', 'Proposed plan')).toBe('_.._outside_.md');
    expect(planMarkdownFilename('... ', 'Proposed plan')).toBe('Proposed plan.md');
    expect(planMarkdownFilename('CON', 'Proposed plan')).toBe('_CON.md');
    expect(planMarkdownFilename('NUL.txt', 'Proposed plan')).toBe('_NUL.txt.md');
    expect(planMarkdownFilename('', 'Fallback / plan')).toBe('Fallback _ plan.md');
    expect(planMarkdownFilename('A'.repeat(400), 'Proposed plan')).toHaveLength(103);
  });
});
