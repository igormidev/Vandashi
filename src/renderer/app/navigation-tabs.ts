import { Clapperboard, Film, Images, Layers, Rocket, Scissors, SlidersHorizontal } from 'lucide-react';

export type Page =
  | 'home'
  | 'brand'
  | 'videos'
  | 'sharedAssets'
  | 'packaging'
  | 'creation'
  | 'manual'
  | 'assets'
  | 'clips'
  | 'launch';
export type Destination = Page | 'checks';
export const brandTabs = [
  { id: 'brand', icon: SlidersHorizontal },
  { id: 'videos', icon: Film },
  { id: 'sharedAssets', icon: Images },
] as const;
export const videoTabs = [
  { id: 'packaging', icon: Layers },
  { id: 'creation', icon: Clapperboard },
  { id: 'manual', icon: SlidersHorizontal },
  { id: 'assets', icon: Images },
  { id: 'clips', icon: Scissors },
  { id: 'launch', icon: Rocket },
] as const;
