import { Clapperboard, File, FileText, Image, Layers, Music, Settings2, Video } from 'lucide-react';
import type { MentionReference } from './mention-references';
import { TasteIcon } from '../brands/TasteIcon';

export function ReferenceIcon({ reference }: { reference: MentionReference }) {
  if (reference.kind === 'taste') return <TasteIcon file={reference.name} />;
  const Icon = {
    script: FileText,
    config: Settings2,
    logo: Image,
    image: Image,
    video: Video,
    audio: Music,
    other: File,
    packaging: Layers,
    composition: Clapperboard,
  }[reference.kind];
  return <Icon size={13} aria-hidden="true" />;
}
