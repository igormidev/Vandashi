/** Durable, full-file speech evidence. Times are seconds in the original media. */
export const transcriptionModels = ['tiny', 'base', 'small', 'medium', 'large-v3-turbo', 'large-v3'] as const;
export type TranscriptionModel = (typeof transcriptionModels)[number];
export const audioCategories = ['dialog', 'music', 'sound-effect'] as const;
export type AudioCategory = (typeof audioCategories)[number];
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}
export interface AssetAnalysis {
  schemaVersion: 1;
  sourceHash: string;
  category: AudioCategory;
  categorySource: 'user' | 'classifier' | 'video';
  transcription:
    | { status: 'not-required'; reason: 'music' | 'sound-effect' | 'no-audio' }
    | {
        status: 'complete';
        engine: 'whisperx';
        model: TranscriptionModel;
        language: string | null;
        duration: number;
        alignment: 'word' | 'segment' | 'none';
        segments: TranscriptSegment[];
        words: TranscriptSegment[];
      };
}

/** Reject incomplete, stale-format or impossible timing evidence instead of presenting it as verified. */
export function parseAssetAnalysis(value: unknown): AssetAnalysis | null {
  if (!value || typeof value !== 'object') return null;
  const analysis = value as Record<string, unknown>;
  if (
    analysis.schemaVersion !== 1 ||
    typeof analysis.sourceHash !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(analysis.sourceHash) ||
    !audioCategories.includes(analysis.category as AudioCategory) ||
    !['user', 'classifier', 'video'].includes(String(analysis.categorySource)) ||
    !analysis.transcription ||
    typeof analysis.transcription !== 'object'
  )
    return null;
  const transcription = analysis.transcription as Record<string, unknown>;
  if (transcription.status === 'not-required') {
    const matchingCategory =
      (analysis.category === 'music' && transcription.reason === 'music') ||
      (analysis.category === 'sound-effect' && transcription.reason === 'sound-effect');
    const silentVideo =
      analysis.category === 'dialog' &&
      analysis.categorySource === 'video' &&
      transcription.reason === 'no-audio';
    return matchingCategory || silentVideo ? (value as AssetAnalysis) : null;
  }
  const duration = transcription.duration;
  if (
    analysis.category !== 'dialog' ||
    transcription.status !== 'complete' ||
    transcription.engine !== 'whisperx' ||
    !transcriptionModels.includes(transcription.model as TranscriptionModel) ||
    (transcription.language !== null &&
      (typeof transcription.language !== 'string' || transcription.language.length > 32)) ||
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration < 0 ||
    !['word', 'segment', 'none'].includes(String(transcription.alignment))
  )
    return null;
  const validTimes = (entries: unknown, maximum: number): entries is TranscriptSegment[] => {
    if (!Array.isArray(entries) || entries.length > maximum) return false;
    let previous = -1;
    return entries.every((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const segment = entry as Record<string, unknown>;
      const start = segment.start;
      const end = segment.end;
      if (
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end < start ||
        start < previous ||
        end > duration ||
        typeof segment.text !== 'string' ||
        !segment.text.trim() ||
        segment.text.length > 64000
      )
        return false;
      previous = start;
      return true;
    });
  };
  if (!validTimes(transcription.segments, 200000) || !validTimes(transcription.words, 1000000)) return null;
  if (transcription.alignment === 'none' && (transcription.segments.length || transcription.words.length))
    return null;
  if (transcription.alignment === 'word' && !transcription.words.length) return null;
  return value as AssetAnalysis;
}
export interface TranscriptionProgress {
  phase:
    'installing' | 'model-download' | 'checking' | 'classifying' | 'transcribing' | 'aligning' | 'saving';
  file?: string;
  fraction?: number;
  completed?: number;
  total?: number;
}
export type TranscriptionProgressListener = (progress: TranscriptionProgress) => void;
/** Paths are supplied by authorized storage/native selection, never arbitrary renderer input. */
export interface TranscriptionPort {
  readonly guidePath?: string;
  prepare(
    model: TranscriptionModel,
    progress: TranscriptionProgressListener,
    signal?: AbortSignal,
  ): Promise<void>;
  analyze(
    input: { path: string; kind: 'audio' | 'video'; model: TranscriptionModel; category?: AudioCategory },
    progress: TranscriptionProgressListener,
    signal?: AbortSignal,
  ): Promise<AssetAnalysis>;
  dispose(): Promise<void>;
}
export interface AssetCategoryChoice {
  assetId: string;
  revision: string;
  category: AudioCategory;
}
export type TranscriptionPreparation =
  | { status: 'ready' }
  | {
      status: 'needs-classification';
      assets: { id: string; title: string; relativePath: string; revision: string }[];
    };
