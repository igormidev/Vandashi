import type { Packaging, Settings } from './models';
import { defaultLocale } from './locales';
// Persisted initial project data uses English independently of the interface locale.
export const defaultImportedClipName = 'Imported clip';
export const defaultImportedVideoName = 'Imported video';
export const defaultSettings: Settings = {
  transcriptionModel: 'large-v3-turbo',
  locale: defaultLocale,
  chat: { model: 'gpt-6-astra', reasoning: 'medium', fast: false },
  automation: { model: 'gpt-6-luna', reasoning: 'medium', fast: false },
  assetMetadata: { model: 'gpt-6-luna', reasoning: 'medium', fast: false },
  chapters: { model: 'gpt-6-luna', reasoning: 'medium', fast: false },
  scriptSync: { model: 'gpt-6-luna', reasoning: 'high', fast: false },
  splits: {},
};
export function emptyPackaging(): Packaging {
  return {
    titles: { long: [], short: [] },
    descriptions: { long: '', short: '' },
    tags: { long: [], short: [] },
    thumbnails: [],
    theme: '',
  };
}
export const platforms = [
  'youtube',
  'youtubeShorts',
  'odysee',
  'rumble',
  'tiktok',
  'instagram',
  'facebook',
  'x',
] as const;
export const tasteFiles = [
  'TITLE_LONG_FORM_VIDEOS_TASTE.md',
  'TITLE_SHORT_FORM_VIDEOS_TASTE.md',
  'DESCRIPTION_LONG_FORM_VIDEOS_TASTE.md',
  'DESCRIPTION_SHORT_FORM_VIDEOS_TASTE.md',
  'THUMBNAIL_TASTE.md',
  'VISUAL_IDENTITY_TASTE.md',
  'TAGS_LONG_FORM_VIDEOS_TASTE.md',
  'TAGS_SHORT_FORM_VIDEOS_TASTE.md',
  'YOUTUBE_SECTIONS_TASTE.md',
  'SCRIPT_LONG_FORM_VIDEOS_TASTE.md',
  'SCRIPT_SHORT_FORM_VIDEOS_TASTE.md',
  'EDITS_LONG_FORM_VIDEOS_TASTE.md',
  'EDITS_SHORT_FORM_VIDEOS_TASTE.md',
] as const;
export function scopeKey(scope: { brandId: string; videoId: string | null; clipId: string | null }): string {
  return [scope.brandId, scope.videoId ?? 'brand', scope.clipId ?? 'main'].join(':');
}
