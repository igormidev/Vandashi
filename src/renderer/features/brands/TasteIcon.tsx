import {
  Captions,
  Clapperboard,
  Clock3,
  Film,
  Hash,
  Image,
  ListVideo,
  Palette,
  PenLine,
  ScanText,
  Scissors,
  Tag,
  Type,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const icons: Record<string, readonly [LucideIcon, string]> = {
  TITLE_LONG_FORM_VIDEOS_TASTE: [Type, '#b1a0ff'],
  TITLE_SHORT_FORM_VIDEOS_TASTE: [Captions, '#d3a4ff'],
  DESCRIPTION_LONG_FORM_VIDEOS_TASTE: [ScanText, '#79bee8'],
  DESCRIPTION_SHORT_FORM_VIDEOS_TASTE: [ListVideo, '#80d6de'],
  THUMBNAIL_TASTE: [Image, '#eeae7b'],
  VISUAL_IDENTITY_TASTE: [Palette, '#ef91b7'],
  TAGS_LONG_FORM_VIDEOS_TASTE: [Hash, '#a8c983'],
  TAGS_SHORT_FORM_VIDEOS_TASTE: [Tag, '#dbd187'],
  YOUTUBE_SECTIONS_TASTE: [Clock3, '#85b7d8'],
  SCRIPT_LONG_FORM_VIDEOS_TASTE: [PenLine, '#7ed6b6'],
  SCRIPT_SHORT_FORM_VIDEOS_TASTE: [Film, '#6ed4cf'],
  EDITS_LONG_FORM_VIDEOS_TASTE: [Clapperboard, '#e9978b'],
  EDITS_SHORT_FORM_VIDEOS_TASTE: [Scissors, '#deb288'],
} as const;

export function TasteIcon({ file }: { file: string }) {
  const key = file.replace('.md', '');
  const [Icon, color] = icons[key] ?? [PenLine, 'currentColor'];
  return <Icon size={13} color={color} aria-hidden="true" />;
}
