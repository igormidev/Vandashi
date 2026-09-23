import { z } from 'zod';

/** Only this owned instruction can travel with an untouched retry draft. */
export const clipHandoffSchema = z
  .object({
    message: z
      .object({
        id: z.literal('clipHandoff'),
        params: z
          .object({ ratio: z.enum(['9:16', '1:1']), start: z.number().nonnegative(), end: z.number() })
          .strict()
          .refine(({ start, end }) => end > start),
      })
      .strict(),
    guidance: z.string().max(2_000_000),
  })
  .strict();
