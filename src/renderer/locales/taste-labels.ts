import type { tasteFiles } from '../../domain/defaults';
import type { Translation } from './resources';

export const tasteLabels: Readonly<Record<(typeof tasteFiles)[number], keyof Translation>> = {
  'TITLE_LONG_FORM_VIDEOS_TASTE.md': 'titleLong',
  'TITLE_SHORT_FORM_VIDEOS_TASTE.md': 'titleShort',
  'DESCRIPTION_LONG_FORM_VIDEOS_TASTE.md': 'descriptionLong',
  'DESCRIPTION_SHORT_FORM_VIDEOS_TASTE.md': 'descriptionShort',
  'THUMBNAIL_TASTE.md': 'thumbnail',
  'VISUAL_IDENTITY_TASTE.md': 'visualIdentity',
  'TAGS_LONG_FORM_VIDEOS_TASTE.md': 'tagsLong',
  'TAGS_SHORT_FORM_VIDEOS_TASTE.md': 'tagsShort',
  'YOUTUBE_SECTIONS_TASTE.md': 'sections',
  'SCRIPT_LONG_FORM_VIDEOS_TASTE.md': 'scriptLong',
  'SCRIPT_SHORT_FORM_VIDEOS_TASTE.md': 'scriptShort',
  'EDITS_LONG_FORM_VIDEOS_TASTE.md': 'editingLong',
  'EDITS_SHORT_FORM_VIDEOS_TASTE.md': 'editingShort',
};

export function tasteLabelKey(filename: string): keyof Translation | undefined {
  return Object.hasOwn(tasteLabels, filename) ? tasteLabels[filename as keyof typeof tasteLabels] : undefined;
}
