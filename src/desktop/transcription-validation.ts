import { z } from 'zod';
import { audioCategories, transcriptionModels } from '../domain/transcription';

export function transcriptionValidators(scope: z.ZodType) {
  return {
    prepareTranscriptionModel: z.tuple([z.enum(transcriptionModels)]),
    prepareTranscriptions: z.tuple([
      z
        .object({
          scope: scope.nullable(),
          categories: z
            .array(
              z
                .object({
                  assetId: z.string().min(1).max(500),
                  revision: z.string().regex(/^[a-f0-9]{64}$/u),
                  category: z.enum(audioCategories),
                })
                .strict(),
            )
            .max(10000)
            .optional(),
        })
        .strict(),
    ]),
  };
}
