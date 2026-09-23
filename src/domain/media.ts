import type { AppMessage } from './messages';
import type { AssetInspectionLease, AssetInspectionProgress } from './asset-inspection';
import type { AspectRatio, DependencyCheck, StudioInfo } from './models';

export interface MediaProbe {
  duration: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  format: string;
}

export interface ClipMediaInput {
  projectPath: string;
  sourceVideoPath: string;
  ratio: '9:16' | '1:1';
  start: number;
  end: number;
  title: string;
}

export type RenderProgress = (progress: number, detail: string, label?: AppMessage) => void;

/** Vendor-neutral operations; paths are supplied by the authorized workspace service. */
export interface MediaPort {
  normalizeProject(projectPath: string): Promise<void>;
  seedProject(projectPath: string, ratio: AspectRatio, title: string): Promise<void>;
  startStudio(projectPath: string): Promise<StudioInfo>;
  stopStudio(): Promise<void>;
  renderVideo(projectPath: string, onProgress?: RenderProgress): Promise<string>;
  cancelRender(): Promise<void>;
  checks(onCheck?: (check: DependencyCheck) => void): Promise<DependencyCheck[]>;
  probeMedia(path: string): Promise<MediaProbe>;
  audioWaveform(path: string): Promise<number[]>;
  inspectAsset(
    path: string,
    onProgress?: (progress: AssetInspectionProgress) => void,
    signal?: AbortSignal,
  ): Promise<AssetInspectionLease>;
  createClip(input: ClipMediaInput): Promise<void>;
  dispose(): Promise<void>;
}
