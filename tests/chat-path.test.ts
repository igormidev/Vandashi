import { describe, expect, it } from 'vitest';
import { messagePath } from '../src/renderer/features/chat/message-path';

describe('chat file references', () => {
  it('resolves Markdown spaces, relative project images, and native file URLs', () => {
    expect(messagePath('/projects/Hidden%20City/cover.png', '/project')).toBe(
      '/projects/Hidden City/cover.png',
    );
    expect(messagePath('thumbnails/cover.png', '/project')).toBe('/project/thumbnails/cover.png');
    expect(messagePath('file:///C:/My%20Videos/cover.png', 'C:/project')).toBe('C:/My Videos/cover.png');
    expect(messagePath('C:\\Videos\\cover.png', 'C:/project')).toBe('C:\\Videos\\cover.png');
  });
  it.each([
    'https://example.com/tracking.png',
    'data:image/svg+xml,ignored',
    'javascript:alert(1)',
    'javascript%3Aalert(1)',
    'file://remote-host/secrets.png',
    'file:///bad%00image.png',
    '//remote-host/image.png',
    '%2F%2Fremote-host/image.png',
    '\\\\remote-host\\image.png',
    '%00private.png',
    'broken%escape.png',
    '#section',
  ])('does not treat %s as a local file', (value) => {
    expect(messagePath(value, '/project')).toBeNull();
  });
});
