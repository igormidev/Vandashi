import type { Chapter, Packaging, Platform, VideoSummary } from '../../../domain/models';

export interface ReleaseDraft {
  platform: Platform;
  clipId: string | null;
  source: VideoSummary;
  packaging: Packaging;
  browser: string;
  chapters: Chapter[];
}
