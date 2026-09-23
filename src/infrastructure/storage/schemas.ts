import { z } from 'zod';
import { defaultSettings, platforms } from '../../domain/defaults';

export const scopeSchema = z.object({
  brandId: z.string().min(1),
  videoId: z.string().nullable(),
  clipId: z.string().nullable(),
});
const strings = z.array(z.string());
const formats = <T extends z.ZodType>(schema: T) => z.object({ long: schema, short: schema });
export const packagingSchema = z
  .object({
    titles: formats(strings),
    descriptions: formats(z.string()),
    tags: formats(strings),
    thumbnails: strings,
    theme: z.string(),
  })
  .strict();
export const brandConfigSchema = z
  .object({
    name: z.string().trim().min(3),
    description: z.string(),
    image: z.string(),
    platforms: z.partialRecord(z.enum(platforms), z.object({ url: z.string(), browser: z.string() })),
  })
  .strict();
const selectionSchema = z.object({
  model: z.string().min(1),
  reasoning: z.string().min(1),
  fast: z.boolean(),
});
export const settingsSchema = z.object({
  locale: z.enum(['en', 'ja', 'fr', 'es', 'de', 'ko', 'pt-BR', 'it']),
  chat: selectionSchema,
  automation: selectionSchema,
  scriptSync: selectionSchema,
  splits: z.record(z.string(), z.number().min(25).max(75)),
  assetMetadata: selectionSchema.default(defaultSettings.assetMetadata),
  chapters: selectionSchema.default(defaultSettings.chapters),
});
const brandSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  lastOpened: z.string(),
});
export const registrySchema = z.object({
  brands: z.array(brandSummarySchema),
  lastBrandId: z.string().nullable(),
  settings: settingsSchema,
});
export const videoRecordSchema = z.object({
  id: z.string().min(1),
  brandId: z.string().min(1),
  name: z.string().min(1),
  ratio: z.enum(['16:9', '9:16', '1:1']),
  origin: z.enum(['composition', 'imported']).default('composition'),
  updatedAt: z.string(),
  renderedPath: z.string().nullable(),
  renderedRevision: z.string().optional(),
  parentVideoId: z.string().optional(),
  start: z.number().nonnegative().optional(),
  end: z.number().positive().optional(),
});
export type VideoRecord = z.infer<typeof videoRecordSchema>;
export const launchSchema = z.object({
  platform: z.enum(platforms),
  status: z.enum(['not_started', 'uploading', 'uploaded', 'failed']),
  url: z.string(),
  clipId: z.string().nullable(),
});
export const launchesSchema = z.array(launchSchema);
export const metadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: strings,
  hash: z.string(),
  contentHash: z.string().optional(),
  metadataStorage: z.enum(['embedded', 'sidecar']).optional(),
  embeddingWarning: z.string().nullable().optional(),
  preserveBytes: z.boolean().optional(),
});
const fileChangeSchema = z.object({
  path: z.string(),
  additions: z.number(),
  deletions: z.number(),
  diff: z.string(),
});
const messageSchema = z
  .object({
    id: z.string(),
    role: z.enum(['user', 'assistant', 'reasoning', 'tool', 'error']),
    text: z.string(),
    turnId: z.string().nullable(),
    files: z.array(fileChangeSchema),
    createdAt: z.string(),
    appMessage: z.object({ id: z.enum(['turnSaved', 'turnUnchanged']) }).optional(),
    generatedImages: z.array(z.string()).max(20).optional(),
  })
  .transform(({ appMessage, generatedImages, ...message }) => ({
    ...message,
    ...(appMessage === undefined ? {} : { appMessage }),
    ...(generatedImages === undefined ? {} : { generatedImages }),
  }));
const checkpointSchema = z
  .object({
    turnId: z.string(),
    threadId: z.string(),
    heads: z.record(z.string(), z.string()),
    messageCount: z.number().int().nonnegative(),
    postHeads: z.record(z.string(), z.string()).optional(),
  })
  .transform(({ postHeads, ...checkpoint }) =>
    postHeads === undefined ? checkpoint : { ...checkpoint, postHeads },
  );
export const sessionSchema = z.object({
  id: z.string(),
  scope: scopeSchema,
  topic: z.string(),
  title: z.string(),
  threadId: z.string().nullable(),
  messages: z.array(messageSchema),
  open: z.boolean(),
  updatedAt: z.string(),
  checkpoints: z.array(checkpointSchema).default([]),
});
