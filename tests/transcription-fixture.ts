import { vi } from 'vitest';
import type { AssetAnalysis, TranscriptionPort } from '../src/domain/transcription';
import { hashFile } from '../src/infrastructure/storage/files';

export function completeAnalysis(sourceHash = 'a'.repeat(64)): AssetAnalysis {
  return {
    schemaVersion: 1,
    sourceHash,
    category: 'dialog',
    categorySource: 'classifier',
    transcription: {
      status: 'complete',
      engine: 'whisperx',
      model: 'large-v3-turbo',
      language: 'en',
      duration: 2,
      alignment: 'word',
      segments: [{ start: 0, end: 1, text: 'Speech evidence' }],
      words: [{ start: 0, end: 1, text: 'Speech' }],
    },
  };
}
export function transcriptionFixture() {
  return {
    guidePath: '/app/system/ASSET_TRANSCRIPTION.md',
    prepare: vi.fn<TranscriptionPort['prepare']>(() => Promise.resolve()),
    analyze: vi.fn<TranscriptionPort['analyze']>(async (input) => {
      const sourceHash = await hashFile(input.path).catch(() => 'a'.repeat(64));
      const analysis = completeAnalysis(sourceHash);
      return input.category && input.category !== 'dialog'
        ? {
            ...analysis,
            category: input.category,
            categorySource: 'user',
            transcription: { status: 'not-required', reason: input.category },
          }
        : {
            ...analysis,
            categorySource: input.kind === 'video' ? 'video' : input.category ? 'user' : 'classifier',
          };
    }),
    dispose: vi.fn<TranscriptionPort['dispose']>(() => Promise.resolve()),
  } satisfies TranscriptionPort;
}
