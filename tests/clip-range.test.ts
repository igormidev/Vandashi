import { describe, expect, it } from 'vitest';
import {
  constrainClipRange,
  timecode,
  validClipName,
  validClipRange,
} from '../src/renderer/features/clips/clip-range';

describe('clip selection bounds', () => {
  it('rejects invalid, empty, inverted, or out-of-video ranges', () => {
    expect(validClipRange({ start: 0, end: 5 }, 5)).toBe(true);
    for (const range of [
      { start: -1, end: 3 },
      { start: 1, end: 1 },
      { start: 2, end: 1 },
      { start: 0, end: 6 },
      { start: NaN, end: 3 },
    ])
      expect(validClipRange(range, 5)).toBe(false);
    expect(validClipRange({ start: 0, end: 5 }, Infinity)).toBe(false);
  });
  it('keeps both handles inside the actual duration and separated', () => {
    expect(constrainClipRange({ start: -4, end: 90 }, 12)).toEqual({ start: 0, end: 12 });
    const range = constrainClipRange({ start: 14, end: 2 }, 12);
    expect(validClipRange(range, 12)).toBe(true);
    expect(constrainClipRange({ start: 0, end: 30 }, 0)).toEqual({ start: 0, end: 0 });
  });
  it('rejects path traversal names while accepting international titles', () => {
    for (const name of ['', '..', '../clip', 'clip/name', 'clip\\name', 'clip?', 'clip.'])
      expect(validClipName(name)).toBe(false);
    expect(validClipName('夜の街')).toBe(true);
    expect(validClipName('A moment')).toBe(true);
  });
  it('formats finite time values without propagating invalid media metadata', () => {
    expect(timecode(61.2)).toBe('01:01.2');
    expect(timecode(NaN)).toBe('00:00.0');
  });
});
