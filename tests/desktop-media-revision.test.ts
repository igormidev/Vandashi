import { describe, expect, it } from 'vitest';
import { mediaRequestPath } from '../src/desktop/validation';

const revision = 'ab12'.repeat(16);
const media = 'vandashi-media://local/file?path=%2Fsafe%2Fbrand.svg';

describe('revisioned media URLs', () => {
  it.each(['GET', 'HEAD'])('accepts only a SHA-256 cache identity without changing the %s file', (method) => {
    expect(mediaRequestPath(`${media}&revision=${revision}`, method)).toBe('/safe/brand.svg');
    expect(mediaRequestPath(media, method)).toBe('/safe/brand.svg');
  });

  it.each([
    '',
    'one',
    '../private',
    'a'.repeat(63),
    'a'.repeat(65),
    'g'.repeat(64),
    'A'.repeat(64),
    `${revision}&revision=${revision}`,
    `${revision}&path=%2Fprivate%2Fimage.svg`,
    `${revision}&extra=1`,
  ])('rejects invalid or ambiguous cache identity %s', (value) => {
    expect(() => mediaRequestPath(`${media}&revision=${value}`, 'GET')).toThrow();
  });

  it('retains the media origin, method, extension and path restrictions', () => {
    const url = `${media}&revision=${revision}`;
    for (const invalid of [
      url.replace('//local/', '//attacker/'),
      url.replace('//local/', '//user:password@local/'),
      url.replace('/file?', '/other?'),
      url.replace('brand.svg', 'secrets.json'),
      url.replace('%2Fsafe%2Fbrand.svg', '%00'),
      `${media}&extra=${revision}`,
    ])
      expect(() => mediaRequestPath(invalid, 'GET')).toThrow();
    expect(() => mediaRequestPath(url, 'POST')).toThrow();
  });
});
