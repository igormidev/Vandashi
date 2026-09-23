import { describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ webFrameMain: { fromId: vi.fn() } }));
import { matchesStudioFrame } from '../src/desktop/studio-host';

describe('native Studio bridge targeting', () => {
  const studio = 'http://127.0.0.1:45678/#project/my-video';
  it('matches only the trusted direct child project at the registered local origin', () => {
    expect(matchesStudioFrame(studio, studio, true)).toBe(true);
    expect(matchesStudioFrame(studio, `${studio}?selection=title`, true)).toBe(true);
    for (const url of [
      'http://127.0.0.1:45679/#project/my-video',
      'http://localhost:45678/#project/my-video',
      'http://127.0.0.1:45678/#project/my-video-evil',
      'http://127.0.0.1:45678/api/projects/my-video/preview',
      'http://evil.test:45678/#project/my-video',
      'http://user@127.0.0.1:45678/#project/my-video',
    ]) {
      expect(matchesStudioFrame(studio, url, true)).toBe(false);
    }
    expect(matchesStudioFrame(studio, studio, false)).toBe(false);
  });
});
