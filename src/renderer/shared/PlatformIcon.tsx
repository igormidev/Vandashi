import {
  siYoutube,
  siYoutubeshorts,
  siOdysee,
  siRumble,
  siTiktok,
  siInstagram,
  siFacebook,
  siX,
} from 'simple-icons';
import type { Platform } from '../../domain/models';
const icons = {
  youtube: siYoutube,
  youtubeShorts: siYoutubeshorts,
  odysee: siOdysee,
  rumble: siRumble,
  tiktok: siTiktok,
  instagram: siInstagram,
  facebook: siFacebook,
  x: siX,
};
export function PlatformIcon({ platform }: { platform: Platform }) {
  const icon = icons[platform];
  return (
    <span className="platform-icon">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill={platform === 'tiktok' || platform === 'x' ? 'currentColor' : `#${icon.hex}`}
      >
        <path d={icon.path} />
      </svg>
    </span>
  );
}
