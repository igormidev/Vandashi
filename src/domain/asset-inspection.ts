export interface AssetInspectionProgress {
  phase: 'preparing' | 'frames' | 'model-download' | 'speech' | 'describing';
  progress: number;
}
export interface AssetInspectionNote {
  frames: number;
  sampledSeconds: number;
  duration: number;
  speech: 'recognized' | 'unavailable' | 'none';
}
export interface InspectedFrame {
  path: string;
  seconds: number;
}
export interface SpeechSegment {
  start: number;
  end: number;
  text: string;
  language: string;
}
/** Temporary evidence is kept alive until the model turn finishes, then disposed in finally. */
export interface AssetInspectionLease {
  /** SHA-256 of the original bytes verified before and after evidence collection. */
  sourceHash: string;
  kind: 'image' | 'video' | 'audio' | 'other';
  images: InspectedFrame[];
  transcript: SpeechSegment[];
  note: AssetInspectionNote;
  dispose: () => Promise<void>;
}
