import type { Chapter, Platform } from './models';

export const horizontalPlatforms: Platform[] = ['youtube', 'odysee', 'rumble'];
export const verticalPlatforms: Platform[] = ['youtubeShorts', 'tiktok', 'instagram', 'facebook', 'x'];
export type ChapterIssue =
  | 'chapterCountError'
  | 'chapterStartError'
  | 'chapterTitleError'
  | 'chapterTimeError'
  | 'chapterSpacingError'
  | 'chapterDurationError';
/** Rules from https://support.google.com/youtube/answer/9884579, checked 2026-09-23. */
export function chapterIssue(chapters: Chapter[], duration?: number): ChapterIssue | null {
  if (chapters.length < 3) return 'chapterCountError';
  if (chapters.some((chapter) => !chapter.title.trim() || /[\r\n]/.test(chapter.title)))
    return 'chapterTitleError';
  if (chapters.some((chapter) => !Number.isInteger(chapter.seconds) || chapter.seconds < 0))
    return 'chapterTimeError';
  if (chapters[0]?.seconds !== 0) return 'chapterStartError';
  if (
    chapters.some((chapter, index) => index > 0 && chapter.seconds - (chapters[index - 1]?.seconds ?? 0) < 10)
  )
    return 'chapterSpacingError';
  if (
    duration !== undefined &&
    (!Number.isFinite(duration) || duration - (chapters.at(-1)?.seconds ?? 0) < 10)
  )
    return 'chapterDurationError';
  return null;
}
export function chapterTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor(safe / 60) % 60;
  return `${hours ? `${String(hours)}:` : ''}${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
export function appendChapters(description: string, chapters: Chapter[]): string {
  const block = chapters
    .map((chapter) => `${chapterTime(chapter.seconds)} ${chapter.title.trim()}`)
    .join('\n');
  return block ? `${description.trimEnd()}\n\n${block}`.trimStart() : description;
}
