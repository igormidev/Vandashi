import { describe, expect, it } from 'vitest';
import { importedClipName, importedMediaFilename, numberedImportName } from '../src/domain/import-names';
import { safeName } from '../src/infrastructure/storage/files';

describe('portable imported media names', () => {
  it.each([
    ['/videos/My finished scene.mp4', 'My finished scene'],
    ['C:\\Videos\\Scene one.MOV', 'Scene one'],
    ['/videos/Cafe\u0301 🎬 — final.mp4', 'Café 🎬 — final'],
    ['/videos/ .Unsafe: name?*<>|\u0001 .mp4', 'Unsafe name'],
    ['/videos/.mp4', 'Imported clip'],
    ['/videos/....mp4', 'Imported clip'],
    ['/videos/CON.mp4', '_CON'],
    ['/videos/con.extra.mp4', '_con.extra'],
    ['/videos/LPT¹.mp4', '_LPT¹'],
    ['/videos/CONOUT$.mp4', '_CONOUT$'],
    ['/videos/a.mp4', 'a'],
  ])('derives a readable portable name from %s', (source, expected) => {
    expect(importedClipName(source)).toBe(expected);
    expect(safeName(importedClipName(source))).toBe(expected);
  });

  it('bounds Unicode byte length and ordinal suffixes without splitting surrogate pairs', () => {
    for (const original of ['😀'.repeat(100), '界'.repeat(100), 'a'.repeat(200)]) {
      const name = importedClipName(`/videos/${original}.mp4`);
      const numbered = numberedImportName(name, 123);
      for (const candidate of [name, numbered]) {
        expect(candidate.length).toBeLessThanOrEqual(100);
        expect(Buffer.byteLength(candidate, 'utf8')).toBeLessThanOrEqual(200);
        expect(Buffer.from(candidate, 'utf8').toString('utf8')).toBe(candidate);
        expect(safeName(candidate)).toBe(candidate);
      }
      expect(numbered).toMatch(/ \(123\)$/u);
    }
  });

  it.each([
    [' .Unsafe: video?.MP4', 'Unsafe video.MP4'],
    ['.mp4', 'Imported video.mp4'],
    ['CON.mp4', '_CON.mp4'],
    ['Café 🎬.mov', 'Café 🎬.mov'],
  ])('keeps the supported extension when the copied filename is sanitized', (input, expected) => {
    expect(importedMediaFilename(input)).toBe(expected);
    expect(safeName(expected)).toBe(expected);
  });

  it('keeps the extension within the total portable filename limit', () => {
    const name = importedMediaFilename(`${'😀'.repeat(100)}.mp4`);
    expect(name.endsWith('.mp4')).toBe(true);
    expect(Buffer.from(name, 'utf8').toString('utf8')).toBe(name);
    expect(name.length).toBeLessThanOrEqual(100);
    expect(Buffer.byteLength(name, 'utf8')).toBeLessThanOrEqual(200);
  });
});
